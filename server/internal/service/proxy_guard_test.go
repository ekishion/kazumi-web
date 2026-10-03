package service

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"kazumi-web-server/internal/config"
)

func TestProxyGuard_SignAndVerify(t *testing.T) {
	cfg := &config.Config{
		ProxySecret:           "test-secret-key-12345",
		ProxyRequireSignature: true,
		ProxySignatureTTL:     2 * time.Second,
		ProxyAllowPrivate:     false,
	}
	guard := NewProxyGuard(cfg)

	rawURL := "https://example.com/video/stream.m3u8"
	referer := "https://example.com/"
	ua := "TestUA/1.0"

	// 1. 正常生成与验签
	token := guard.Sign(rawURL, referer, ua)
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if err := guard.Verify(rawURL, referer, ua, token); err != nil {
		t.Fatalf("verify valid token failed: %v", err)
	}

	// 2. 篡改 URL
	if err := guard.Verify("https://example.com/other.m3u8", referer, ua, token); !errors.Is(err, ErrSigInvalid) {
		t.Fatalf("expected ErrSigInvalid for tampered URL, got: %v", err)
	}

	// 3. 篡改 Referer
	if err := guard.Verify(rawURL, "https://bad.com/", ua, token); !errors.Is(err, ErrSigInvalid) {
		t.Fatalf("expected ErrSigInvalid for tampered referer, got: %v", err)
	}

	// 4. 篡改 UA
	if err := guard.Verify(rawURL, referer, "BadUA", token); !errors.Is(err, ErrSigInvalid) {
		t.Fatalf("expected ErrSigInvalid for tampered UA, got: %v", err)
	}

	// 5. 篡改 Token 本身
	if err := guard.Verify(rawURL, referer, ua, token+"tampered"); !errors.Is(err, ErrSigInvalid) {
		t.Fatalf("expected ErrSigInvalid for tampered token, got: %v", err)
	}

	// 6. 缺参/格式错误
	if err := guard.Verify(rawURL, referer, ua, ""); !errors.Is(err, ErrSigMissing) {
		t.Fatalf("expected ErrSigMissing for empty token, got: %v", err)
	}
	if err := guard.Verify(rawURL, referer, ua, "invalid-token-no-dot"); !errors.Is(err, ErrSigInvalid) {
		t.Fatalf("expected ErrSigInvalid for malformed token, got: %v", err)
	}
	if err := guard.Verify(rawURL, referer, ua, "notanumber.signature"); !errors.Is(err, ErrSigInvalid) {
		t.Fatalf("expected ErrSigInvalid for non-numeric exp, got: %v", err)
	}

	// 7. 过期签名
	pastExp := time.Now().Unix() - 10
	pastSig := guard.signature(rawURL, referer, ua, pastExp)
	pastToken := fmt.Sprintf("%d.%s", pastExp, pastSig)
	if err := guard.Verify(rawURL, referer, ua, pastToken); !errors.Is(err, ErrSigExpired) {
		t.Fatalf("expected ErrSigExpired for expired token, got: %v", err)
	}

	// 8. requireSig = false 时跳过验签
	noSigGuard := &ProxyGuard{
		secret:     []byte("test-secret-key-12345"),
		requireSig: false,
	}
	if err := noSigGuard.Verify(rawURL, referer, ua, "any-random-string"); err != nil {
		t.Fatalf("expected nil when requireSig=false, got: %v", err)
	}
	if err := noSigGuard.Verify(rawURL, referer, ua, ""); err != nil {
		t.Fatalf("expected nil for empty token when requireSig=false, got: %v", err)
	}
}

func TestProxyGuard_CheckURL(t *testing.T) {
	guard := &ProxyGuard{
		allowPrivate: false,
		lookupIP: func(ctx context.Context, host string) ([]net.IPAddr, error) {
			switch host {
			case "public.example.com":
				return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
			case "internal.local":
				return []net.IPAddr{{IP: net.ParseIP("192.168.1.100")}}, nil
			case "ipv6-internal.local":
				return []net.IPAddr{{IP: net.ParseIP("fe80::1")}}, nil
			default:
				return nil, errors.New("host not found")
			}
		},
	}

	tests := []struct {
		name    string
		url     string
		wantErr error
	}{
		// 合法公网地址
		{"valid_public_domain", "https://public.example.com/video.m3u8", nil},
		{"valid_public_ip", "http://93.184.216.34/segment.ts", nil},

		// IPv4 私网与环回
		{"ipv4_loopback", "http://127.0.0.1/video.m3u8", ErrBlockedAddr},
		{"ipv4_private_10", "http://10.0.0.1/stream", ErrBlockedAddr},
		{"ipv4_private_172", "http://172.16.0.1/stream", ErrBlockedAddr},
		{"ipv4_private_192", "http://192.168.0.1/stream", ErrBlockedAddr},
		{"ipv4_link_local", "http://169.254.1.1/stream", ErrBlockedAddr},
		{"ipv4_unspecified", "http://0.0.0.0/stream", ErrBlockedAddr},

		// IPv6 私网与环回
		{"ipv6_loopback", "http://[::1]/stream", ErrBlockedAddr},
		{"ipv6_link_local", "http://[fe80::1]/stream", ErrBlockedAddr},

		// 域名解析为私网 (SSRF)
		{"domain_to_private", "http://internal.local/api", ErrBlockedAddr},
		{"domain_to_ipv6_private", "http://ipv6-internal.local/api", ErrBlockedAddr},
		{"domain_resolve_fail", "http://notfound.example.com/api", ErrBlockedAddr},

		// 非法协议与格式
		{"scheme_file", "file:///etc/passwd", ErrInvalidURL},
		{"scheme_ftp", "ftp://example.com/resource", ErrInvalidURL},
		{"scheme_javascript", "javascript:alert(1)", ErrInvalidURL},
		{"with_userinfo", "http://admin:secret@public.example.com/stream", ErrInvalidURL},
		{"empty_host", "http:///path", ErrInvalidURL},
		{"empty_url", "", ErrInvalidURL},
		{"too_long_url", "http://public.example.com/" + strings.Repeat("a", 9000), ErrInvalidURL},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := guard.CheckURL(tc.url)
			if tc.wantErr == nil && err != nil {
				t.Fatalf("expected nil err, got: %v", err)
			}
			if tc.wantErr != nil && !errors.Is(err, tc.wantErr) {
				t.Fatalf("expected error %v, got: %v", tc.wantErr, err)
			}
		})
	}
}

func TestProxyGuard_DNSRebinding(t *testing.T) {
	// 模拟 DNS 重绑定：
	// 第一次调用（CheckURL）返回公网 IP；
	// 第二次调用（DialContext 拨号前）切换为私网 IP 127.0.0.1。
	var callCount int32
	guard := &ProxyGuard{
		allowPrivate: false,
		lookupIP: func(ctx context.Context, host string) ([]net.IPAddr, error) {
			count := atomic.AddInt32(&callCount, 1)
			if count == 1 {
				// 第一次解析通过（CheckURL）
				return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
			}
			// 第二次解析（DialContext 时重绑定为私网 IP）
			return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
		},
	}

	target := "http://rebind.attacker.com/stream.m3u8"

	// 1. 静态 CheckURL 通过
	if err := guard.CheckURL(target); err != nil {
		t.Fatalf("CheckURL should have passed on initial lookup, got: %v", err)
	}

	// 2. DialContext 二次校验发现重绑定为 127.0.0.1，必须阻断
	ctx := context.Background()
	conn, err := guard.DialContext(ctx, "tcp", "rebind.attacker.com:80")
	if conn != nil {
		conn.Close()
		t.Fatal("expected DialContext to fail on rebound private IP, but connection was established")
	}
	if !errors.Is(err, ErrBlockedAddr) {
		t.Fatalf("expected ErrBlockedAddr on DNS rebinding, got: %v", err)
	}
}
