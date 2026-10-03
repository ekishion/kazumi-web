package service

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/publicsuffix"

	"kazumi-web-server/internal/config"
	"kazumi-web-server/internal/engine"
)

// ErrNotManifest 目标返回的不是有效的 m3u8 清单。
var ErrNotManifest = errors.New("not_manifest")

// UpstreamStatusError 上游返回了非 2xx/3xx 状态码。
type UpstreamStatusError struct {
	Status int
	Reason string
}

func (e *UpstreamStatusError) Error() string {
	if e.Reason == "" {
		return fmt.Sprintf("上游响应异常状态码: %d", e.Status)
	}
	return fmt.Sprintf("上游响应异常状态码: %d (%s)", e.Status, e.Reason)
}

// signedQueryHints 命中这些标记说明 URL 自带签名/时效参数，此时不能附加 Referer，
// 否则 CDN 会判定签名与来源不匹配而返回 403。
var signedQueryHints = []string{
	"x-amz-signature", "x-amz-credential", "x-obs-", "sign=", "signature=",
	"auth_key=", "expires=", "token=", "wssecret=", "wsse=", "hmac=",
}

type StreamService struct {
	cfg              *config.Config
	guard            *ProxyGuard
	client           *http.Client
	noRedirectClient *http.Client
}

// NewStreamService 构造流服务。guard 负责地址校验（SSRF）与 URL 签名。
func NewStreamService(cfg *config.Config, guard *ProxyGuard) *StreamService {
	timeout := cfg.ProxyHTTPTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	maxRedirects := cfg.ProxyMaxRedirects
	if maxRedirects <= 0 {
		maxRedirects = 5
	}

	// Cookie 会话：部分视频源需要先建立会话才能取流。
	jar, _ := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})

	newClient := func(checkRedirect func(req *http.Request, via []*http.Request) error) *http.Client {
		return &http.Client{
			Timeout:       timeout,
			Jar:           jar,
			CheckRedirect: checkRedirect,
			Transport: &http.Transport{
				Proxy:               http.ProxyFromEnvironment,
				DialContext:         guard.DialContext, // 拨号前再次校验，防 DNS 重绑定
				MaxIdleConns:        32,
				MaxIdleConnsPerHost: 8,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 15 * time.Second,
				ForceAttemptHTTP2:   true,
			},
		}
	}

	return &StreamService{
		cfg:   cfg,
		guard: guard,
		client: newClient(func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return fmt.Errorf("stopped after %d redirects", maxRedirects)
			}
			return nil
		}),
		noRedirectClient: newClient(func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}),
	}
}

// pickReferer 决定请求该带什么 Referer（对齐防盗链的常见校验方式）。
func pickReferer(target, ruleReferer string) string {
	lower := strings.ToLower(target)
	for _, hint := range signedQueryHints {
		if strings.Contains(lower, hint) {
			return ""
		}
	}
	if ruleReferer != "" {
		return ruleReferer
	}
	if parsed, err := url.Parse(target); err == nil && parsed.Scheme != "" && parsed.Host != "" {
		return parsed.Scheme + "://" + parsed.Host + "/"
	}
	return ""
}

func defaultUA(ua, fallback string) string {
	if strings.TrimSpace(ua) != "" {
		return ua
	}
	return fallback
}

// fetch 发起上游请求：自带 Referer 策略，并在 401/403 时退回"不带 Referer"重试一次。
func (s *StreamService) fetch(
	client *http.Client,
	ctx context.Context,
	target, referer, userAgent, rangeHeader string,
) (*http.Response, error) {
	candidates := []string{pickReferer(target, referer)}
	if candidates[0] != "" {
		candidates = append(candidates, "")
	}

	for idx, ref := range candidates {
		req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
		if err != nil {
			return nil, ErrInvalidURL
		}
		req.Header.Set("User-Agent", defaultUA(userAgent, s.cfg.UserAgent))
		req.Header.Set("Accept", "*/*")
		if ref != "" {
			req.Header.Set("Referer", ref)
		}
		if rangeHeader != "" {
			req.Header.Set("Range", rangeHeader)
		}

		resp, err := client.Do(req)
		if err != nil {
			return nil, ClassifyTransportError(err)
		}
		if idx < len(candidates)-1 &&
			(resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden) {
			_ = resp.Body.Close()
			continue
		}
		return resp, nil
	}
	return nil, ErrUpstreamError
}

// proxyURL 把上游 URL 包装成本服务的代理地址，并追加签名。
func (s *StreamService) proxyURL(base *url.URL, rawURI, referer, userAgent, proxyBase string) string {
	resolved := engine.NormalizeURL(base.String(), rawURI)
	endpoint := "segment"
	if strings.Contains(strings.ToLower(resolved), ".m3u8") {
		endpoint = "m3u8"
	}

	query := url.Values{}
	query.Set("url", resolved)
	query.Set("referer", referer)
	query.Set("ua", userAgent)

	out := fmt.Sprintf("%s/api/stream/%s?%s", strings.TrimRight(proxyBase, "/"), endpoint, query.Encode())
	if signed := s.guard.SignQuery(resolved, referer, userAgent); signed != "" {
		out += "&" + signed
	}
	return out
}

// rewriteURIAttributes 改写一行 HLS 标签里所有 `URI="…"`。
// 覆盖 #EXT-X-KEY / SESSION-KEY / MEDIA / I-FRAME-STREAM-INF / MAP / PART / PRELOAD-HINT /
// CONTENT-STEERING 等所有带 URI 属性的标签，避免逐个标签硬编码漏项。
func (s *StreamService) rewriteURIAttributes(
	line string,
	base *url.URL,
	referer, userAgent, proxyBase string,
) (string, bool) {
	const marker = `URI="`
	if !strings.Contains(line, marker) {
		return line, false
	}

	var out strings.Builder
	rest := line
	changed := false
	for {
		idx := strings.Index(rest, marker)
		if idx < 0 {
			out.WriteString(rest)
			break
		}
		out.WriteString(rest[:idx+len(marker)])
		rest = rest[idx+len(marker):]

		end := strings.Index(rest, `"`)
		if end < 0 {
			out.WriteString(rest)
			break
		}
		rawURI := rest[:end]
		if rawURI == "" {
			out.WriteString(rest)
			break
		}
		out.WriteString(s.proxyURL(base, rawURI, referer, userAgent, proxyBase))
		rest = rest[end:]
		changed = true
	}
	return out.String(), changed
}

// RewriteM3U8 请求远程 m3u8，并将所有切片、子清单、密钥及媒体标签的 URI
// 重写为经过本服务的代理接口。
func (s *StreamService) RewriteM3U8(
	ctx context.Context,
	m3u8URL, referer, userAgent, proxyBase string,
) (string, error) {
	resp, err := s.fetch(s.client, ctx, m3u8URL, referer, userAgent, "")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return "", &UpstreamStatusError{Status: resp.StatusCode}
	}

	// 以重定向后的最终地址作为基址，否则相对路径会解析到错误的目录。
	base := resp.Request.URL
	if base == nil {
		parsed, parseErr := url.Parse(m3u8URL)
		if parseErr != nil {
			return "", ErrInvalidURL
		}
		base = parsed
	}

	return s.RewriteM3U8Stream(resp.Body, base, referer, userAgent, proxyBase)
}

// RewriteM3U8Stream 从 io.Reader 读取 m3u8 并重写其中的所有 URI。
func (s *StreamService) RewriteM3U8Stream(
	r io.Reader,
	base *url.URL,
	referer, userAgent, proxyBase string,
) (string, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // 容忍超长行（如大段 KEY 参数）

	var output strings.Builder
	firstLineChecked := false

	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r")
		if strings.TrimSpace(line) == "" {
			output.WriteString("\n")
			continue
		}

		if !firstLineChecked {
			firstLineChecked = true
			// 部分清单带 UTF-8 BOM
			stripped := strings.TrimPrefix(line, "\uFEFF")
			if !strings.HasPrefix(stripped, "#EXTM3U") {
				return "", ErrNotManifest
			}
			line = stripped
		}

		if strings.HasPrefix(line, "#") {
			if rewritten, ok := s.rewriteURIAttributes(line, base, referer, userAgent, proxyBase); ok {
				line = rewritten
			}
			output.WriteString(line + "\n")
			continue
		}

		// 非标签行：分片 ts 或嵌套子清单
		output.WriteString(s.proxyURL(base, strings.TrimSpace(line), referer, userAgent, proxyBase) + "\n")
	}

	if err := scanner.Err(); err != nil {
		return "", err
	}
	if !firstLineChecked {
		return "", ErrNotManifest
	}
	return output.String(), nil
}

// ProxySegment 流式转发媒体分片、密钥文件或嵌套清单。
func (s *StreamService) ProxySegment(
	ctx context.Context,
	method, targetURL, referer, userAgent string,
	clientHeaders http.Header,
	w http.ResponseWriter,
) error {
	if strings.Contains(strings.ToLower(targetURL), ".m3u8") {
		host := clientHeaders.Get("Host")
		if host == "" {
			host = "localhost:8080"
		}
		proto := clientHeaders.Get("X-Forwarded-Proto")
		if proto == "" {
			proto = "http"
		}
		proxyBase := proto + "://" + host

		rewritten, err := s.RewriteM3U8(ctx, targetURL, referer, userAgent, proxyBase)
		if err != nil {
			return err
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, err = w.Write([]byte(rewritten))
		return err
	}

	if method == "" {
		method = "GET"
	}

	// 分片/密钥走不透传重定向的客户端，便于把 S3/OBS 预签名 30x 交还浏览器。
	resp, err := s.fetch(s.noRedirectClient, ctx, targetURL, referer, userAgent, clientHeaders.Get("Range"))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		location := resp.Header.Get("Location")
		if location != "" {
			resolved := engine.NormalizeURL(targetURL, location)
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "*")
			w.Header().Set("X-Kazumi-Upstream-Status", fmt.Sprintf("%d", resp.StatusCode))
			http.Redirect(w, &http.Request{Method: method}, resolved, resp.StatusCode)
			return nil
		}
	}

	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("X-Kazumi-Upstream-Status", fmt.Sprintf("%d", resp.StatusCode))
	// 分片不做服务端缓存，避免签名过期与鉴权缓存串号
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.WriteHeader(resp.StatusCode)

	_, err = io.Copy(w, resp.Body)
	return err
}
