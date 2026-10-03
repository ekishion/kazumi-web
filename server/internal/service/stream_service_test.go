package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"kazumi-web-server/internal/config"
)

func newTestStreamService() (*StreamService, *ProxyGuard) {
	cfg := &config.Config{
		UserAgent:             "Mozilla/5.0 KazumiWeb/1.0",
		ProxySecret:           "test-m3u8-secret-key",
		ProxyRequireSignature: true,
		ProxySignatureTTL:     2 * time.Hour,
		ProxyAllowPrivate:     true, // 测试环境允许访问 localhost/httptest
		ProxyHTTPTimeout:      5 * time.Second,
		ProxyMaxRedirects:     5,
	}
	guard := NewProxyGuard(cfg)
	svc := NewStreamService(cfg, guard)
	return svc, guard
}

func TestStreamService_RewriteM3U8_TableDriven(t *testing.T) {
	svc, _ := newTestStreamService()
	base, _ := url.Parse("https://media.example.com/hls/live/playlist.m3u8")
	proxyBase := "http://localhost:8080"
	referer := "https://example.com/"
	ua := "TestPlayer/1.0"

	tests := []struct {
		name       string
		input      string
		wantErr    error
		mustContain []string
	}{
		{
			name: "relative_and_absolute_ts_segments",
			input: "#EXTM3U\n" +
				"#EXT-X-VERSION:3\n" +
				"#EXTINF:10.0,\n" +
				"segment0.ts\n" +
				"#EXTINF:10.0,\n" +
				"https://cdn.example.com/seg1.ts\n",
			mustContain: []string{
				"/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fsegment0.ts",
				"/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fcdn.example.com%2Fseg1.ts",
			},
		},
		{
			name: "key_aes128",
			input: "#EXTM3U\n" +
				`#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x1234` + "\n" +
				"#EXTINF:10.0,\n" +
				"seg.ts\n",
			mustContain: []string{
				`#EXT-X-KEY:METHOD=AES-128,URI="http://localhost:8080/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fenc.key`,
			},
		},
		{
			name: "session_key",
			input: "#EXTM3U\n" +
				`#EXT-X-SESSION-KEY:METHOD=AES-128,URI="session.key"` + "\n",
			mustContain: []string{
				`#EXT-X-SESSION-KEY:METHOD=AES-128,URI="http://localhost:8080/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fsession.key`,
			},
		},
		{
			name: "media_audio_and_subtitles",
			input: "#EXTM3U\n" +
				`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="audio-en.m3u8"` + "\n" +
				`#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Chinese",URI="subs-zh.m3u8"` + "\n",
			mustContain: []string{
				`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="http://localhost:8080/api/stream/m3u8?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Faudio-en.m3u8`,
				`#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Chinese",URI="http://localhost:8080/api/stream/m3u8?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fsubs-zh.m3u8`,
			},
		},
		{
			name: "iframe_stream_inf",
			input: "#EXTM3U\n" +
				`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=86000,URI="iframe_low.m3u8"` + "\n",
			mustContain: []string{
				`#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=86000,URI="http://localhost:8080/api/stream/m3u8?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fiframe_low.m3u8`,
			},
		},
		{
			name: "fmp4_ext_x_map",
			input: "#EXTM3U\n" +
				`#EXT-X-MAP:URI="init.mp4",BYTERANGE="718@0"` + "\n" +
				"#EXTINF:6.0,\n" +
				"chunk1.m4s\n",
			mustContain: []string{
				`#EXT-X-MAP:URI="http://localhost:8080/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Finit.mp4`,
				`/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fchunk1.m4s`,
			},
		},
		{
			name: "ll_hls_part_and_preload_hint",
			input: "#EXTM3U\n" +
				"#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0\n" +
				`#EXT-X-PART:DURATION=0.33334,URI="part0.mp4"` + "\n" +
				`#EXT-X-PRELOAD-HINT:TYPE=PART,URI="preload-part1.mp4"` + "\n",
			mustContain: []string{
				`#EXT-X-PART:DURATION=0.33334,URI="http://localhost:8080/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fpart0.mp4`,
				`#EXT-X-PRELOAD-HINT:TYPE=PART,URI="http://localhost:8080/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fpreload-part1.mp4`,
			},
		},
		{
			name: "utf8_bom_tolerant",
			input: "\uFEFF#EXTM3U\n" +
				"#EXTINF:10.0,\n" +
				"seg_bom.ts\n",
			mustContain: []string{
				"#EXTM3U",
				"seg_bom.ts",
			},
		},
		{
			name: "multiple_uris_in_single_line",
			input: "#EXTM3U\n" +
				`#EXT-X-CUSTOM:URI="first.ts",ALT_URI="second.m3u8"` + "\n",
			mustContain: []string{
				`URI="http://localhost:8080/api/stream/segment?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Ffirst.ts`,
				`ALT_URI="http://localhost:8080/api/stream/m3u8?referer=https%3A%2F%2Fexample.com%2F&ua=TestPlayer%2F1.0&url=https%3A%2F%2Fmedia.example.com%2Fhls%2Flive%2Fsecond.m3u8`,
			},
		},
		{
			name:    "not_manifest_html",
			input:   "<!DOCTYPE html><html><body>Error 404</body></html>",
			wantErr: ErrNotManifest,
		},
		{
			name:    "not_manifest_empty",
			input:   "",
			wantErr: ErrNotManifest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res, err := svc.RewriteM3U8Stream(strings.NewReader(tc.input), base, referer, ua, proxyBase)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("expected error %v, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			for _, must := range tc.mustContain {
				if !strings.Contains(res, must) {
					t.Errorf("rewritten output missing %q, got:\n%s", must, res)
				}
			}
			// 确保签名参数被附带
			if !strings.Contains(res, "exp=") || !strings.Contains(res, "sig=") {
				t.Errorf("rewritten output missing signature params, got:\n%s", res)
			}
		})
	}
}

func TestStreamService_RedirectBaseURL(t *testing.T) {
	// 测试重定向后的基址修正：
	// 请求 /root.m3u8 发生 302 重定向到 /sub/dir/real.m3u8
	// 清单中的相对路径 segment.ts 必须解析为 /sub/dir/segment.ts 而不是 /segment.ts
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/root.m3u8":
			http.Redirect(w, r, "/sub/dir/real.m3u8", http.StatusFound)
		case "/sub/dir/real.m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Write([]byte("#EXTM3U\n#EXTINF:10.0,\nrelative_seg.ts\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	svc, _ := newTestStreamService()
	rewritten, err := svc.RewriteM3U8(context.Background(), server.URL+"/root.m3u8", "", "TestUA", "http://localhost:8080")
	if err != nil {
		t.Fatalf("RewriteM3U8 failed: %v", err)
	}

	expectedTarget := server.URL + "/sub/dir/relative_seg.ts"
	escapedTarget := url.QueryEscape(expectedTarget)
	if !strings.Contains(rewritten, escapedTarget) {
		t.Fatalf("expected relative segment to resolve to %s, got rewritten:\n%s", expectedTarget, rewritten)
	}
}

func TestStreamService_PickReferer(t *testing.T) {
	tests := []struct {
		name        string
		target      string
		ruleReferer string
		want        string
	}{
		{
			name:        "aws_signed_url",
			target:      "https://bucket.s3.amazonaws.com/video.ts?X-Amz-Signature=abcd1234ef",
			ruleReferer: "https://rule-referer.com/",
			want:        "",
		},
		{
			name:        "huawei_obs_signed_url",
			target:      "https://bucket.obs.cn-north-4.myhuaweicloud.com/video.ts?x-obs-signature=123",
			ruleReferer: "https://rule-referer.com/",
			want:        "",
		},
		{
			name:        "auth_key_signed_url",
			target:      "https://cdn.example.com/live/stream.m3u8?auth_key=1600000-0-0-test",
			ruleReferer: "https://rule-referer.com/",
			want:        "",
		},
		{
			name:        "rule_referer_preferred",
			target:      "https://media.example.com/playlist.m3u8",
			ruleReferer: "https://official.example.com/",
			want:        "https://official.example.com/",
		},
		{
			name:        "fallback_origin",
			target:      "https://media.example.com/playlist.m3u8",
			ruleReferer: "",
			want:        "https://media.example.com/",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := pickReferer(tc.target, tc.ruleReferer)
			if got != tc.want {
				t.Errorf("pickReferer(%q, %q) = %q, want %q", tc.target, tc.ruleReferer, got, tc.want)
			}
		})
	}
}

func TestStreamService_RefererRetryOn403(t *testing.T) {
	// 验证：上游如果因为 Referer 返回 403，fetch 会自动尝试去 Referer 重试一次
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if r.Header.Get("Referer") != "" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Write([]byte("#EXTM3U\n#EXTINF:5.0,\nseg.ts\n"))
	}))
	defer server.Close()

	svc, _ := newTestStreamService()
	rewritten, err := svc.RewriteM3U8(context.Background(), server.URL+"/stream.m3u8", "https://bad-referer.com/", "TestUA", "http://localhost:8080")
	if err != nil {
		t.Fatalf("expected retry without referer to succeed, got: %v", err)
	}
	if attempts != 2 {
		t.Fatalf("expected 2 attempts (first with referer, second without), got %d", attempts)
	}
	if !strings.Contains(rewritten, "seg.ts") {
		t.Fatalf("unexpected rewritten output: %s", rewritten)
	}
}

func TestStreamService_CookieJarSession(t *testing.T) {
	// 验证代理 Client 携带 CookieJar 保持会话
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil || cookie.Value != "valid-session" {
			// 第一次访问下发 cookie 并 302 重定向
			http.SetCookie(w, &http.Cookie{Name: "session_token", Value: "valid-session", Path: "/"})
			http.Redirect(w, r, "/authed.m3u8", http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Write([]byte("#EXTM3U\n#EXTINF:5.0,\nauthed_seg.ts\n"))
	}))
	defer server.Close()

	svc, _ := newTestStreamService()
	rewritten, err := svc.RewriteM3U8(context.Background(), server.URL+"/login.m3u8", "", "TestUA", "http://localhost:8080")
	if err != nil {
		t.Fatalf("RewriteM3U8 failed across cookie session redirect: %v", err)
	}
	if !strings.Contains(rewritten, "authed_seg.ts") {
		t.Fatalf("expected authed_seg.ts in rewritten output, got:\n%s", rewritten)
	}
}
