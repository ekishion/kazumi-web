package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"kazumi-web-server/internal/config"
)

// 代理校验错误：由 handler 映射为 HTTP 状态码与 X-Kazumi-Error 头。
var (
	ErrSigMissing    = errors.New("signature_missing")
	ErrSigInvalid    = errors.New("signature_invalid")
	ErrSigExpired    = errors.New("signature_expired")
	ErrBlockedAddr   = errors.New("blocked_address")
	ErrInvalidURL    = errors.New("invalid_url")
	ErrUpstreamError = errors.New("upstream_error")
	ErrTimeout       = errors.New("timeout")
)

// maxProxyURLLen 限制代理目标 URL 长度，避免超长 URL 放大攻击。
const maxProxyURLLen = 8 * 1024

// ProxyGuard 负责两件事：
//  1. 给代理地址签名 / 验签，避免本服务被当作开放代理滥用；
//  2. 校验目标地址，阻断私网、环回、链路本地等 SSRF 目标（含 DNS 重绑定）。
type ProxyGuard struct {
	secret       []byte
	ttl          time.Duration
	requireSig   bool
	allowPrivate bool
	lookupIP     func(ctx context.Context, host string) ([]net.IPAddr, error)
}

// NewProxyGuard 读取配置构造守卫。密钥缺省时进程内随机生成（重启后旧链接失效）。
func NewProxyGuard(cfg *config.Config) *ProxyGuard {
	secret := strings.TrimSpace(cfg.ProxySecret)
	if secret == "" {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			// 极端情况下退化为固定串，仅影响签名强度，不影响功能
			buf = []byte("kazumi-web-proxy-fallback-secret")
		}
		secret = base64.RawURLEncoding.EncodeToString(buf)
		log.Printf("[Kazumi Web] 代理密钥未配置，已生成进程内临时密钥（重启后旧播放链接会失效，可用 PROXY_SECRET 固定）")
	}

	return &ProxyGuard{
		secret:       []byte(secret),
		ttl:          cfg.ProxySignatureTTL,
		requireSig:   cfg.ProxyRequireSignature,
		allowPrivate: cfg.ProxyAllowPrivate,
	}
}

// RequireSignature 暴露给 handler 判断是否需要验签。
func (g *ProxyGuard) RequireSignature() bool { return g.requireSig }

// Sign 返回 "exp.sig"（HMAC-SHA256, base64url）
func (g *ProxyGuard) Sign(rawURL, referer, ua string) string {
	exp := time.Now().Add(g.ttl).Unix()
	return fmt.Sprintf("%d.%s", exp, g.signature(rawURL, referer, ua, exp))
}

// SignQuery 为代理目标生成查询参数串（包含 token、exp、sig）
func (g *ProxyGuard) SignQuery(rawURL, referer, ua string) string {
	if !g.requireSig {
		return ""
	}
	exp := time.Now().Add(g.ttl).Unix()
	sig := g.signature(rawURL, referer, ua, exp)
	return fmt.Sprintf("exp=%d&sig=%s&token=%d.%s", exp, sig, exp, sig)
}

// Verify 校验签名 token。未开启强制签名时直接通过。
func (g *ProxyGuard) Verify(rawURL, referer, ua, token string) error {
	if !g.requireSig {
		return nil
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return ErrSigMissing
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return ErrSigInvalid
	}
	exp, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return ErrSigInvalid
	}
	if time.Now().Unix() > exp {
		return ErrSigExpired
	}
	expected := g.signature(rawURL, referer, ua, exp)
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return ErrSigInvalid
	}
	return nil
}

func (g *ProxyGuard) signature(rawURL, referer, ua string, exp int64) string {
	mac := hmac.New(sha256.New, g.secret)
	fmt.Fprintf(mac, "%s\n%s\n%s\n%d", rawURL, referer, ua, exp)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (g *ProxyGuard) lookup(ctx context.Context, host string) ([]net.IPAddr, error) {
	if g.lookupIP != nil {
		return g.lookupIP(ctx, host)
	}
	return net.DefaultResolver.LookupIPAddr(ctx, host)
}

// CheckURL 校验目标地址：仅 http/https、无 userinfo、长度受限、不得指向内网。
func (g *ProxyGuard) CheckURL(rawURL string) error {
	return g.checkURL(context.Background(), rawURL)
}

func (g *ProxyGuard) checkURL(ctx context.Context, rawURL string) error {
	if len(rawURL) > maxProxyURLLen {
		return ErrInvalidURL
	}
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return ErrInvalidURL
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ErrInvalidURL
	}
	if parsed.User != nil {
		return ErrInvalidURL
	}
	if g.allowPrivate {
		return nil
	}

	host := parsed.Hostname()
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return ErrBlockedAddr
		}
		return nil
	}

	ips, err := g.lookup(ctx, host)
	if err != nil || len(ips) == 0 {
		return ErrBlockedAddr
	}
	for _, item := range ips {
		if isBlockedIP(item.IP) {
			return ErrBlockedAddr
		}
	}
	return nil
}

// isBlockedIP 判定单个地址是否属于内网 / 环回 / 链路本地 / 组播 / 未指定。
func isBlockedIP(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() ||
		ip.IsMulticast() ||
		ip.IsInterfaceLocalMulticast()
}

// DialContext 供代理 http.Transport 使用：在真正拨号前对解析结果二次判定，
// 阻断 DNS 重绑定（校验时是公网 IP，拨号时变成内网 IP）。
func (g *ProxyGuard) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, ErrInvalidURL
	}

	dialer := &net.Dialer{Timeout: 15 * time.Second}
	if g.allowPrivate {
		return dialer.DialContext(ctx, network, addr)
	}

	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return nil, ErrBlockedAddr
		}
		return dialer.DialContext(ctx, network, addr)
	}

	ips, err := g.lookup(ctx, host)
	if err != nil || len(ips) == 0 {
		return nil, ErrBlockedAddr
	}
	for _, item := range ips {
		if isBlockedIP(item.IP) {
			return nil, ErrBlockedAddr
		}
	}
	// 用已校验的 IP 直连，避免解析结果在二次解析时被替换
	return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
}

// ClassifyTransportError 把传输层错误粗分类，供 handler 输出 X-Kazumi-Error。
func ClassifyTransportError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrBlockedAddr) || errors.Is(err, ErrInvalidURL) {
		return err
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return ErrTimeout
	}
	if strings.Contains(err.Error(), "context deadline exceeded") {
		return ErrTimeout
	}
	return ErrUpstreamError
}

// ProxyErrorHeader 根据错误返回 X-Kazumi-Error 取值。
func ProxyErrorHeader(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrSigMissing):
		return "signature_missing"
	case errors.Is(err, ErrSigInvalid):
		return "signature_invalid"
	case errors.Is(err, ErrSigExpired):
		return "signature_expired"
	case errors.Is(err, ErrBlockedAddr):
		return "blocked_address"
	case errors.Is(err, ErrInvalidURL):
		return "invalid_url"
	case errors.Is(err, ErrTimeout):
		return "timeout"
	default:
		return "upstream_error"
	}
}

// ProxyErrorStatus 根据错误返回建议的 HTTP 状态码。
func ProxyErrorStatus(err error) int {
	switch {
	case err == nil:
		return http.StatusOK
	case errors.Is(err, ErrSigMissing), errors.Is(err, ErrSigInvalid), errors.Is(err, ErrSigExpired):
		return http.StatusForbidden
	case errors.Is(err, ErrBlockedAddr), errors.Is(err, ErrInvalidURL):
		return http.StatusBadRequest
	case errors.Is(err, ErrTimeout):
		return http.StatusBadGateway
	default:
		return http.StatusBadGateway
	}
}
