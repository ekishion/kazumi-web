package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port      string
	DataDir   string
	DBPath    string
	UserAgent string

	// 流代理相关配置（见 internal/service/proxy_guard.go）
	// ProxySecret 为空时由 ProxyGuard 生成进程内临时密钥（重启后旧播放链接失效）。
	ProxySecret string
	// ProxyRequireSignature 强制代理 URL 验签，关闭即回到开放代理（不推荐）。
	ProxyRequireSignature bool
	// ProxySignatureTTL 代理 URL 签名有效期。
	ProxySignatureTTL time.Duration
	// ProxyAllowPrivate 允许代理访问私网地址（默认关闭，用于本机调试转发）。
	ProxyAllowPrivate bool
	// ProxyHTTPTimeout 代理请求超时。
	ProxyHTTPTimeout time.Duration
	// ProxyMaxRedirects 代理请求最大重定向次数。
	ProxyMaxRedirects int
}

func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	_ = os.MkdirAll(dataDir, 0755)

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = filepath.Join(dataDir, "kazumi.db")
	}

	return &Config{
		Port:      port,
		DataDir:   dataDir,
		DBPath:    dbPath,
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 KazumiWeb/1.0",

		ProxySecret:           strings.TrimSpace(os.Getenv("PROXY_SECRET")),
		ProxyRequireSignature: envBool("PROXY_REQUIRE_SIGNATURE", true),
		ProxySignatureTTL:     envDuration("PROXY_SIGNATURE_TTL", 6*time.Hour),
		ProxyAllowPrivate:     envBool("PROXY_ALLOW_PRIVATE", false),
		ProxyHTTPTimeout:      envDuration("PROXY_HTTP_TIMEOUT", 30*time.Second),
		ProxyMaxRedirects:     envInt("PROXY_MAX_REDIRECTS", 5),
	}
}

func envBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

// envDuration 同时接受 Go duration 写法（"30s"）与纯小时数（"6"）。
func envDuration(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	if value, err := time.ParseDuration(raw); err == nil && value > 0 {
		return value
	}
	if hours, err := strconv.ParseFloat(raw, 64); err == nil && hours > 0 {
		return time.Duration(hours * float64(time.Hour))
	}
	return fallback
}
