package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"kazumi-web-server/internal/config"
	"kazumi-web-server/internal/service"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestRouter(upstreamServerURL string) (*gin.Engine, *service.ProxyGuard) {
	cfg := &config.Config{
		UserAgent:             "Mozilla/5.0 KazumiWeb/1.0",
		ProxySecret:           "handler-test-secret-12345",
		ProxyRequireSignature: true,
		ProxySignatureTTL:     1 * time.Hour,
		ProxyAllowPrivate:     true, // 测试允许本地 upstream
		ProxyHTTPTimeout:      2 * time.Second,
		ProxyMaxRedirects:     3,
	}

	guard := service.NewProxyGuard(cfg)
	streamSvc := service.NewStreamService(cfg, guard)
	streamResolver := service.NewStreamResolver(cfg, guard)

	h := NewAppHandler(cfg, guard, nil, nil, streamSvc, streamResolver, nil, nil, nil)
	return SetupRouter(h), guard
}

func TestRouter_Proxy_ErrorSurface(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok.m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Write([]byte("#EXTM3U\n#EXTINF:10.0,\nseg1.ts\n"))
		case "/upstream-403.m3u8":
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte("Forbidden by CDN"))
		case "/upstream-500.m3u8":
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("Internal Server Error"))
		case "/not-manifest.m3u8":
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("<html>Not a playlist</html>"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	router, guard := setupTestRouter(upstream.URL)

	// 1. 未签名 URL 应直接返回 403 signature_missing
	t.Run("missing_signature", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/stream/m3u8?url="+url.QueryEscape(upstream.URL+"/ok.m3u8"), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got: %d", w.Code)
		}
		if got := w.Header().Get("X-Kazumi-Error"); got != "signature_missing" {
			t.Fatalf("expected X-Kazumi-Error: signature_missing, got: %q", got)
		}
	})

	// 2. 篡改签名返回 403 signature_invalid
	t.Run("invalid_signature", func(t *testing.T) {
		rawURL := upstream.URL + "/ok.m3u8"
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/stream/m3u8?url=%s&token=9999999999.invalid_signature", url.QueryEscape(rawURL)), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got: %d", w.Code)
		}
		if got := w.Header().Get("X-Kazumi-Error"); got != "signature_invalid" {
			t.Fatalf("expected X-Kazumi-Error: signature_invalid, got: %q", got)
		}
	})

	// 3. 上游返回 403 → 透传 403 并在 Header 中标注 X-Kazumi-Upstream-Status: 403 与 X-Kazumi-Error: upstream_403
	t.Run("upstream_403", func(t *testing.T) {
		rawURL := upstream.URL + "/upstream-403.m3u8"
		token := guard.Sign(rawURL, "", "")
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/stream/m3u8?url=%s&token=%s", url.QueryEscape(rawURL), token), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got: %d", w.Code)
		}
		if got := w.Header().Get("X-Kazumi-Upstream-Status"); got != "403" {
			t.Fatalf("expected X-Kazumi-Upstream-Status: 403, got: %q", got)
		}
		if got := w.Header().Get("X-Kazumi-Error"); got != "upstream_403" {
			t.Fatalf("expected X-Kazumi-Error: upstream_403, got: %q", got)
		}
	})

	// 4. 上游返回非清单内容 → 502 not_manifest
	t.Run("not_manifest", func(t *testing.T) {
		rawURL := upstream.URL + "/not-manifest.m3u8"
		token := guard.Sign(rawURL, "", "")
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/stream/m3u8?url=%s&token=%s", url.QueryEscape(rawURL), token), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadGateway {
			t.Fatalf("expected status 502, got: %d", w.Code)
		}
		if got := w.Header().Get("X-Kazumi-Error"); got != "not_manifest" {
			t.Fatalf("expected X-Kazumi-Error: not_manifest, got: %q", got)
		}
	})

	// 5. 上游连接失败 / 不可达域名 → 502 upstream_error
	t.Run("upstream_unreachable", func(t *testing.T) {
		rawURL := "http://240.0.0.1:9999/unreachable.m3u8" // 不可达保留 IP
		token := guard.Sign(rawURL, "", "")
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/stream/m3u8?url=%s&token=%s", url.QueryEscape(rawURL), token), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadGateway && w.Code != http.StatusGatewayTimeout {
			t.Fatalf("expected status 502/504, got: %d", w.Code)
		}
		if got := w.Header().Get("X-Kazumi-Error"); got != "upstream_error" && got != "timeout" {
			t.Fatalf("expected X-Kazumi-Error: upstream_error or timeout, got: %q", got)
		}
	})

	// 6. 正常已签名清单请求 → 200 OK 并重写
	t.Run("success_rewritten", func(t *testing.T) {
		rawURL := upstream.URL + "/ok.m3u8"
		token := guard.Sign(rawURL, "", "")
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/stream/m3u8?url=%s&token=%s", url.QueryEscape(rawURL), token), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got: %d, body: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "/api/stream/segment") {
			t.Fatalf("expected rewritten segment URL in body, got:\n%s", w.Body.String())
		}
	})

	// 7. 私网地址阻断（SSRF 保护）
	t.Run("blocked_private_address", func(t *testing.T) {
		cfgStrict := &config.Config{
			UserAgent:             "Mozilla/5.0 KazumiWeb/1.0",
			ProxySecret:           "handler-test-secret-12345",
			ProxyRequireSignature: false, // 即使无需签名，SSRF 检查依然强制
			ProxyAllowPrivate:     false,
		}
		guardStrict := service.NewProxyGuard(cfgStrict)
		streamSvcStrict := service.NewStreamService(cfgStrict, guardStrict)
		streamResolverStrict := service.NewStreamResolver(cfgStrict, guardStrict)
		hStrict := NewAppHandler(cfgStrict, guardStrict, nil, nil, streamSvcStrict, streamResolverStrict, nil, nil, nil)
		strictRouter := SetupRouter(hStrict)

		req := httptest.NewRequest("GET", "/api/stream/segment?url="+url.QueryEscape("http://127.0.0.1:8080/api/rules"), nil)
		w := httptest.NewRecorder()
		strictRouter.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for private address, got: %d", w.Code)
		}
		if got := w.Header().Get("X-Kazumi-Error"); got != "blocked_address" {
			t.Fatalf("expected X-Kazumi-Error: blocked_address, got: %q", got)
		}
	})
}
