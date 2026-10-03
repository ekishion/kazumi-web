package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"

	"kazumi-web-server/internal/config"
	"kazumi-web-server/internal/engine"
)

type ResolvedStream struct {
	OriginalURL string `json:"originalUrl"`
	RealURL     string `json:"realUrl"`
	Format      string `json:"format"` // "m3u8" | "mp4" | "none" | "iframe"
	PlayURL     string `json:"playUrl"`
	Referer     string `json:"referer"`
	UserAgent   string `json:"userAgent"`
	IsIframe    bool   `json:"isIframe"`
	// ErrorCode 供前端分类失败原因：none / blocked_address / invalid_url / upstream_error
	ErrorCode string `json:"errorCode,omitempty"`
	// Attempts 记录嗅探阶段轨迹，便于前端展示与排障
	Attempts []string `json:"attempts,omitempty"`
}

type StreamResolver struct {
	cfg    *config.Config
	guard  *ProxyGuard
	client *http.Client
}

func NewStreamResolver(cfg *config.Config, guard *ProxyGuard) *StreamResolver {
	timeout := cfg.ProxyHTTPTimeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &StreamResolver{
		cfg:   cfg,
		guard: guard,
		client: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				Proxy:               http.ProxyFromEnvironment,
				DialContext:         guard.DialContext,
				MaxIdleConns:        16,
				IdleConnTimeout:     60 * time.Second,
				TLSHandshakeTimeout: 15 * time.Second,
				ForceAttemptHTTP2:   true,
			},
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("stopped after 10 redirects")
				}
				return nil
			},
		},
	}
}

// Resolve 智能嗅探解析视频真实流
func (r *StreamResolver) Resolve(ctx context.Context, pageURL, referer, userAgent string) (*ResolvedStream, error) {
	pageURL = strings.TrimSpace(pageURL)
	if pageURL == "" {
		return nil, fmt.Errorf("目标 URL 不能为空")
	}

	if userAgent == "" {
		userAgent = r.cfg.UserAgent
	}

	// 地址校验：规则可能指向私网地址（SSRF），此处与代理入口共用同一套判定
	if guardErr := r.guard.CheckURL(pageURL); guardErr != nil {
		return &ResolvedStream{
			OriginalURL: pageURL,
			Format:      "none",
			Referer:     referer,
			UserAgent:   userAgent,
			ErrorCode:   ProxyErrorHeader(guardErr),
		}, nil
	}

	// 1. 快速判定：本身就是 m3u8 或 mp4 直链
	if isDirectMediaURL(pageURL) {
		format := "mp4"
		if strings.Contains(strings.ToLower(pageURL), ".m3u8") {
			format = "m3u8"
		}
		return r.buildResult(pageURL, pageURL, format, referer, userAgent, false), nil
	}

	// 2. 发起页面请求抓取 HTML
	htmlContent, finalURL, isMedia, err := r.fetchHTML(ctx, pageURL, referer, userAgent)
	if err == nil {
		// 如果跳转后的响应本身已经是媒体流
		if isMedia {
			format := "mp4"
			if strings.Contains(strings.ToLower(finalURL), ".m3u8") {
				format = "m3u8"
			}
			return r.buildResult(pageURL, finalURL, format, referer, userAgent, false), nil
		}

		// 3. 解析 MacCMS (var player_aaaa = {...})
		if streamURL, ok := r.sniffMacCMS(htmlContent, finalURL); ok && streamURL != "" {
			if isDirectMediaURL(streamURL) {
				format := "mp4"
				if strings.Contains(strings.ToLower(streamURL), ".m3u8") {
					format = "m3u8"
				}
				return r.buildResult(pageURL, streamURL, format, finalURL, userAgent, false), nil
			}
			// 若解析出来的地址仍是中间播放页或解析接口（如 jx.php?url=），进行二级嗅探
			if subStream, ok := r.sniffSecondHop(ctx, streamURL, finalURL, userAgent); ok && subStream != "" {
				format := "mp4"
				if strings.Contains(strings.ToLower(subStream), ".m3u8") {
					format = "m3u8"
				}
				return r.buildResult(pageURL, subStream, format, streamURL, userAgent, false), nil
			}
		}

		// 4. 扫描 JS 变量中的播放器配置 (Artplayer / DPlayer / VideoJS)
		if streamURL, ok := r.sniffScriptConfigs(htmlContent); ok && streamURL != "" {
			streamURL = engine.NormalizeURL(finalURL, streamURL)
			format := "mp4"
			if strings.Contains(strings.ToLower(streamURL), ".m3u8") {
				format = "m3u8"
			}
			return r.buildResult(pageURL, streamURL, format, finalURL, userAgent, false), nil
		}

		// 5. 扫描 HTML <video> 或 <source>
		if streamURL, ok := r.sniffVideoTags(htmlContent); ok && streamURL != "" {
			streamURL = engine.NormalizeURL(finalURL, streamURL)
			format := "mp4"
			if strings.Contains(strings.ToLower(streamURL), ".m3u8") {
				format = "m3u8"
			}
			return r.buildResult(pageURL, streamURL, format, finalURL, userAgent, false), nil
		}

		// 6. 扫描 <iframe> 标签并跟进
		if iframeURL, ok := r.sniffIframe(htmlContent, finalURL); ok && iframeURL != "" {
			// 检查 iframe 的参数中是否直接含有媒体地址 (decodeVideoSource 逻辑)
			if extracted := decodeVideoSourceParam(iframeURL); extracted != iframeURL && isDirectMediaURL(extracted) {
				format := "mp4"
				if strings.Contains(strings.ToLower(extracted), ".m3u8") {
					format = "m3u8"
				}
				return r.buildResult(pageURL, extracted, format, finalURL, userAgent, false), nil
			}

			// 跟进 iframe 页面嗅探
			if subStream, ok := r.sniffSecondHop(ctx, iframeURL, finalURL, userAgent); ok && subStream != "" {
				format := "mp4"
				if strings.Contains(strings.ToLower(subStream), ".m3u8") {
					format = "m3u8"
				}
				return r.buildResult(pageURL, subStream, format, iframeURL, userAgent, false), nil
			}
		}
	}

	// 7. 二级网络嗅探：静态规则未命中时，启动 Chrome 无头 DevTools 协议嗅探（捕获动态混淆 JS 发起的媒体流请求）
	if streamURL, ok := r.sniffWithChromedp(ctx, pageURL, referer, userAgent); ok && streamURL != "" {
		if extracted := decodeVideoSourceParam(streamURL); extracted != streamURL && isDirectMediaURL(extracted) {
			streamURL = extracted
		}
		format := "mp4"
		if strings.Contains(strings.ToLower(streamURL), ".m3u8") {
			format = "m3u8"
		}
		return r.buildResult(pageURL, streamURL, format, pageURL, userAgent, false), nil
	}

	// 8. 兜底策略：未嗅探到任何有效视频直链
	// 严禁将外部动漫网站直接以 iframe 呈现给用户，返回空流由前端提示并自动切换其它源
	return &ResolvedStream{
		OriginalURL: pageURL,
		RealURL:     "",
		Format:      "none",
		PlayURL:     "",
		Referer:     referer,
		UserAgent:   userAgent,
		IsIframe:    false,
		ErrorCode:   "unsupported",
		Attempts: []string{
			"direct-url", "fetch-html", "maccms", "script-config",
			"video-tag", "iframe", "chromedp",
		},
	}, nil
}

// buildResult 组装结果，并把真实流包装成带签名的代理地址。
func (r *StreamResolver) buildResult(originalURL, realURL, format, referer, userAgent string, isIframe bool) *ResolvedStream {
	playURL := realURL
	if !isIframe && realURL != "" {
		endpoint := ""
		switch format {
		case "m3u8":
			endpoint = "m3u8"
		case "mp4":
			endpoint = "segment"
		}
		if endpoint != "" {
			query := url.Values{}
			query.Set("url", realURL)
			query.Set("referer", referer)
			query.Set("ua", userAgent)
			playURL = fmt.Sprintf("/api/stream/%s?%s", endpoint, query.Encode())
			if signed := r.guard.SignQuery(realURL, referer, userAgent); signed != "" {
				playURL += "&" + signed
			}
		}
	}

	return &ResolvedStream{
		OriginalURL: originalURL,
		RealURL:     realURL,
		Format:      format,
		PlayURL:     playURL,
		Referer:     referer,
		UserAgent:   userAgent,
		IsIframe:    isIframe,
		ErrorCode:   "none",
	}
}

func (r *StreamResolver) fetchHTML(ctx context.Context, targetURL, referer, userAgent string) (string, string, bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return "", "", false, err
	}
	req.Header.Set("User-Agent", userAgent)
	if referer != "" {
		req.Header.Set("Referer", referer)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return "", "", false, err
	}
	defer resp.Body.Close()

	finalURL := resp.Request.URL.String()
	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(contentType, "mpegurl") || strings.Contains(contentType, "video/") {
		return "", finalURL, true, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return "", finalURL, false, err
	}

	return string(body), finalURL, false, nil
}

var maccmsRegex = regexp.MustCompile(`player_aaaa\s*=\s*({[^<]+?});?<\/(?:script|div)`)

func (r *StreamResolver) sniffMacCMS(html, baseURL string) (string, bool) {
	matches := maccmsRegex.FindStringSubmatch(html)
	if len(matches) < 2 {
		return "", false
	}

	var data struct {
		Encrypt int    `json:"encrypt"`
		URL     string `json:"url"`
		From    string `json:"from"`
	}
	if err := json.Unmarshal([]byte(matches[1]), &data); err != nil {
		return "", false
	}

	decodedURL := decodeMacCMSUrl(data.URL, data.Encrypt)
	if decodedURL == "" {
		return "", false
	}

	// 检查解出的 URL 是否包含 url= 参数
	if extracted := decodeVideoSourceParam(decodedURL); extracted != decodedURL {
		return engine.NormalizeURL(baseURL, extracted), true
	}

	return engine.NormalizeURL(baseURL, decodedURL), true
}

func decodeMacCMSUrl(raw string, encrypt int) string {
	raw = strings.TrimSpace(raw)
	switch encrypt {
	case 1:
		unescaped, _ := url.QueryUnescape(raw)
		return unescaped
	case 2:
		// 先 Base64 解码，再 URL 解码
		decoded, err := base64.StdEncoding.DecodeString(raw)
		if err == nil {
			unescaped, _ := url.QueryUnescape(string(decoded))
			return unescaped
		}
		// 有时为 URL-safe base64
		decoded, err = base64.URLEncoding.DecodeString(raw)
		if err == nil {
			unescaped, _ := url.QueryUnescape(string(decoded))
			return unescaped
		}
		return raw
	case 3:
		// 先 URL 解码，再 Base64
		unescaped, _ := url.QueryUnescape(raw)
		decoded, err := base64.StdEncoding.DecodeString(unescaped)
		if err == nil {
			return string(decoded)
		}
		return unescaped
	default:
		return raw
	}
}

var directMediaExtRegex = regexp.MustCompile(`(?i)\.(m3u8|mp4|mkv|flv|webm)(\?.*)?$`)

func isDirectMediaURL(u string) bool {
	lower := strings.ToLower(u)
	return strings.Contains(lower, ".m3u8") ||
		strings.Contains(lower, ".mp4") ||
		strings.Contains(lower, "/m3u8") ||
		directMediaExtRegex.MatchString(u)
}

// decodeVideoSourceParam 复刻原版 Kazumi media.dart 的 decodeVideoSource
func decodeVideoSourceParam(iframeUrl string) string {
	decoded, _ := url.QueryUnescape(iframeUrl)
	u, err := url.Parse(decoded)
	if err != nil {
		return iframeUrl
	}
	for _, v := range u.Query() {
		for _, val := range v {
			if isDirectMediaURL(val) {
				return val
			}
		}
	}
	return iframeUrl
}

var scriptMediaRegex = regexp.MustCompile(`(?i)["'](https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)["']`)
var artplayerConfigRegex = regexp.MustCompile(`(?i)url\s*:\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4)[^'"]*)['"]`)

func (r *StreamResolver) sniffScriptConfigs(html string) (string, bool) {
	// 优先匹配播放器配置中的 url 字段
	if m := artplayerConfigRegex.FindStringSubmatch(html); len(m) > 1 {
		return m[1], true
	}
	// 兜底扫描所有包含 .m3u8 / .mp4 的绝对链接
	allMatches := scriptMediaRegex.FindAllStringSubmatch(html, -1)
	for _, m := range allMatches {
		if len(m) > 1 {
			val := m[1]
			if !strings.Contains(val, "ad.") && !strings.Contains(val, "google") {
				return val, true
			}
		}
	}
	return "", false
}

var videoTagRegex = regexp.MustCompile(`(?i)<video\b[^>]*\bsrc=["']([^"']+)["']`)
var sourceTagRegex = regexp.MustCompile(`(?i)<source\b[^>]*\bsrc=["']([^"']+)["']`)

func (r *StreamResolver) sniffVideoTags(html string) (string, bool) {
	if m := videoTagRegex.FindStringSubmatch(html); len(m) > 1 {
		return m[1], true
	}
	if m := sourceTagRegex.FindStringSubmatch(html); len(m) > 1 {
		return m[1], true
	}
	return "", false
}

var iframeTagRegex = regexp.MustCompile(`(?i)<iframe\b[^>]*\bsrc=["']([^"']+)["']`)

func (r *StreamResolver) sniffIframe(html, baseURL string) (string, bool) {
	matches := iframeTagRegex.FindAllStringSubmatch(html, -1)
	for _, m := range matches {
		if len(m) > 1 {
			src := strings.TrimSpace(m[1])
			if src != "" && !strings.Contains(src, "about:blank") && !strings.Contains(src, "google") {
				return engine.NormalizeURL(baseURL, src), true
			}
		}
	}
	return "", false
}

func (r *StreamResolver) sniffSecondHop(ctx context.Context, hopURL, referer, userAgent string) (string, bool) {
	html, finalURL, isMedia, err := r.fetchHTML(ctx, hopURL, referer, userAgent)
	if err != nil || isMedia {
		if isMedia {
			return finalURL, true
		}
		return "", false
	}

	if streamURL, ok := r.sniffMacCMS(html, finalURL); ok && streamURL != "" && isDirectMediaURL(streamURL) {
		return streamURL, true
	}

	if streamURL, ok := r.sniffScriptConfigs(html); ok && streamURL != "" {
		return engine.NormalizeURL(finalURL, streamURL), true
	}

	if streamURL, ok := r.sniffVideoTags(html); ok && streamURL != "" {
		return engine.NormalizeURL(finalURL, streamURL), true
	}

	return "", false
}

// sniffWithChromedp 启动 Chrome 无头浏览器监听 DevTools 网络请求，截获真实视频流
func (r *StreamResolver) sniffWithChromedp(ctx context.Context, targetURL, referer, userAgent string) (string, bool) {
	tempDir, err := os.MkdirTemp("", "kazumi_chrome_*")
	if err == nil {
		defer os.RemoveAll(tempDir)
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", "new"),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("mute-audio", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("blink-settings", "imagesEnabled=false"),
	)

	// Windows 下优先使用安装的标准 Chrome
	chromePath := `C:\Program Files\Google\Chrome\Application\chrome.exe`
	if _, err := os.Stat(chromePath); err == nil {
		opts = append(opts, chromedp.ExecPath(chromePath))
	}
	if tempDir != "" {
		opts = append(opts, chromedp.UserDataDir(tempDir))
	}
	if userAgent != "" {
		opts = append(opts, chromedp.UserAgent(userAgent))
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(ctx, opts...)
	defer allocCancel()

	chromeCtx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	timeoutCtx, timeoutCancel := context.WithTimeout(chromeCtx, 8*time.Second)
	defer timeoutCancel()

	foundChan := make(chan string, 1)

	chromedp.ListenTarget(timeoutCtx, func(ev interface{}) {
		switch e := ev.(type) {
		case *network.EventRequestWillBeSent:
			u := e.Request.URL
			if isDirectMediaURL(u) {
				if !strings.Contains(u, "google") && !strings.Contains(u, "doubleclick") {
					select {
					case foundChan <- u:
					default:
					}
				}
			} else {
				if extracted := decodeVideoSourceParam(u); extracted != u && isDirectMediaURL(extracted) {
					select {
					case foundChan <- extracted:
					default:
					}
				}
			}
		case *network.EventResponseReceived:
			mime := strings.ToLower(e.Response.MimeType)
			u := e.Response.URL
			if strings.Contains(mime, "mpegurl") || strings.Contains(mime, "video/") {
				if isDirectMediaURL(u) {
					select {
					case foundChan <- u:
					default:
					}
				}
			}
		}
	})

	go func() {
		headers := network.Headers{}
		if referer != "" {
			headers["Referer"] = referer
		}
		_ = chromedp.Run(timeoutCtx,
			network.Enable(),
			network.SetExtraHTTPHeaders(headers),
			chromedp.Navigate(targetURL),
			chromedp.Sleep(6*time.Second),
		)
	}()

	select {
	case found := <-foundChan:
		return found, true
	case <-timeoutCtx.Done():
		return "", false
	}
}

