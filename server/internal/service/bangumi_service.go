package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type cacheEntry struct {
	data      []byte
	expiresAt time.Time
}

type BangumiService struct {
	client *http.Client
	cache  map[string]cacheEntry
	mu     sync.RWMutex
}

// MirrorPingResult 镜像测活结果
type MirrorPingResult struct {
	Success   bool   `json:"success"`
	Status    int    `json:"status"`
	LatencyMs int64  `json:"latency"`
	Endpoint  string `json:"endpoint"`
	Message   string `json:"message"`
}

func NewBangumiService() *BangumiService {
	return &BangumiService{
		client: &http.Client{
			Timeout: 8 * time.Second,
			Transport: &http.Transport{
				Proxy: http.ProxyFromEnvironment,
			},
		},
		cache: make(map[string]cacheEntry),
	}
}

func (s *BangumiService) fetchWithCache(ctx context.Context, targetURL string, ttl time.Duration) ([]byte, error) {
	s.mu.RLock()
	if entry, found := s.cache[targetURL]; found && time.Now().Before(entry.expiresAt) {
		s.mu.RUnlock()
		return entry.data, nil
	}
	s.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "KazumiWeb/1.0 (https://github.com/ekishion/Kazumi-web)")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Bangumi API 错误响应: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cache[targetURL] = cacheEntry{
		data:      body,
		expiresAt: time.Now().Add(ttl),
	}
	s.mu.Unlock()

	return body, nil
}

const bangumiAPIDomain = "https://api.bgm.tv"

// normalizeBaseURL 规范化用户输入的镜像地址：
// 去除两端空白和尾部斜杠；如果用户未显式输入协议头（如只输入 example.com），自动补齐 https://。
func normalizeBaseURL(input string) string {
	base := strings.TrimRight(strings.TrimSpace(input), "/")
	if base == "" {
		return ""
	}
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "https://" + base
	}
	return base
}

// resolveEndpoint 根据用户配置的镜像地址计算完整 URL。
// 用户未配置镜像时，始终使用官方 https://api.bgm.tv。
func resolveEndpoint(mirror, path string) string {
	base := normalizeBaseURL(mirror)
	if base == "" {
		base = bangumiAPIDomain
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return base + path
}

// PingMirror 对用户输入的镜像进行连通性测活
func (s *BangumiService) PingMirror(ctx context.Context, mirror string) *MirrorPingResult {
	targetBase := normalizeBaseURL(mirror)
	if targetBase == "" {
		targetBase = bangumiAPIDomain
	}
	pingURL := targetBase + "/calendar"

	start := time.Now()
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(pingCtx, "GET", pingURL, nil)
	if err != nil {
		return &MirrorPingResult{
			Success:   false,
			Status:    0,
			LatencyMs: time.Since(start).Milliseconds(),
			Endpoint:  targetBase,
			Message:   fmt.Sprintf("创建请求失败: %v", err),
		}
	}
	req.Header.Set("User-Agent", "KazumiWeb/1.0 (https://github.com/ekishion/Kazumi-web)")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return &MirrorPingResult{
			Success:   false,
			Status:    0,
			LatencyMs: latency,
			Endpoint:  targetBase,
			Message:   fmt.Sprintf("连接失败: %v", err),
		}
	}
	defer resp.Body.Close()

	success := resp.StatusCode >= 200 && resp.StatusCode < 400
	msg := fmt.Sprintf("HTTP %d OK", resp.StatusCode)
	if !success {
		msg = fmt.Sprintf("HTTP 异常状态 %d", resp.StatusCode)
	}

	return &MirrorPingResult{
		Success:   success,
		Status:    resp.StatusCode,
		LatencyMs: latency,
		Endpoint:  targetBase,
		Message:   msg,
	}
}

// GetCalendar 获取放送日历（新番时间表）
func (s *BangumiService) GetCalendar(ctx context.Context, mirror string) (any, error) {
	// 优先请求指定镜像或官方 API
	targetURL := resolveEndpoint(mirror, "/calendar")
	data, err := s.fetchWithCache(ctx, targetURL, 2*time.Hour)
	if err == nil && len(data) > 0 {
		var res any
		if jsonErr := json.Unmarshal(data, &res); jsonErr == nil {
			return res, nil
		}
	}

	// 若使用了自定义镜像失败，可尝试回退一次官方
	if mirror != "" {
		officialURL := resolveEndpoint("", "/calendar")
		data, err = s.fetchWithCache(ctx, officialURL, 2*time.Hour)
		if err == nil && len(data) > 0 {
			var res any
			if jsonErr := json.Unmarshal(data, &res); jsonErr == nil {
				return res, nil
			}
		}
	}

	// 降级使用内置兜底日历数据，避免用户卡死在骨架屏
	return getFallbackCalendar(), nil
}

// GetSubjectDetail 获取番剧详情
func (s *BangumiService) GetSubjectDetail(ctx context.Context, subjectID, mirror string) (any, error) {
	targetURL := resolveEndpoint(mirror, "/v0/subjects/"+subjectID)
	data, err := s.fetchWithCache(ctx, targetURL, 24*time.Hour)
	if err != nil && mirror != "" {
		// 备选官方
		data, err = s.fetchWithCache(ctx, resolveEndpoint("", "/v0/subjects/"+subjectID), 24*time.Hour)
	}
	if err != nil {
		return nil, err
	}
	var res any
	err = json.Unmarshal(data, &res)
	return res, err
}

// GetSubjectCharacters 获取番剧角色
func (s *BangumiService) GetSubjectCharacters(ctx context.Context, subjectID, mirror string) (any, error) {
	targetURL := resolveEndpoint(mirror, "/v0/subjects/"+subjectID+"/characters")
	data, err := s.fetchWithCache(ctx, targetURL, 24*time.Hour)
	if err != nil && mirror != "" {
		data, err = s.fetchWithCache(ctx, resolveEndpoint("", "/v0/subjects/"+subjectID+"/characters"), 24*time.Hour)
	}
	if err != nil {
		return nil, err
	}
	var res any
	err = json.Unmarshal(data, &res)
	return res, err
}

// SearchSubjects 搜索番剧
func (s *BangumiService) SearchSubjects(ctx context.Context, keyword, mirror string) (any, error) {
	escaped := url.PathEscape(keyword)
	targetURL := resolveEndpoint(mirror, "/search/subject/"+escaped+"?type=2&responseGroup=large")
	data, err := s.fetchWithCache(ctx, targetURL, 30*time.Minute)
	if err != nil && mirror != "" {
		data, err = s.fetchWithCache(ctx, resolveEndpoint("", "/search/subject/"+escaped+"?type=2&responseGroup=large"), 30*time.Minute)
	}
	if err != nil {
		return nil, err
	}
	var res any
	err = json.Unmarshal(data, &res)
	return res, err
}

// 离线/网络波动时的兜底热门番剧
func getFallbackCalendar() any {
	fallbackJSON := `[
		{
			"weekday": { "en": "Mon", "cn": "星期一", "ja": "月曜", "id": 1 },
			"items": [
				{
					"id": 400600,
					"name": "葬送のフリーレン",
					"name_cn": "葬送的芙莉莲",
					"summary": "打倒魔王之后的勇者一行的后续物语。",
					"images": { "large": "https://lain.bgm.tv/pic/cover/l/d0/09/400600_v08i0.jpg", "common": "https://lain.bgm.tv/r/400/pic/cover/l/d0/09/400600_v08i0.jpg" },
					"rating": { "score": 8.8, "total": 12500 },
					"eps": 28
				},
				{
					"id": 460228,
					"name": "ダンジョン飯",
					"name_cn": "迷宫饭",
					"summary": "在迷宫中烹饪魔物的奇妙冒险物语。",
					"images": { "large": "https://lain.bgm.tv/pic/cover/l/e1/93/460228_42Ccr.jpg", "common": "https://lain.bgm.tv/r/400/pic/cover/l/e1/93/460228_42Ccr.jpg" },
					"rating": { "score": 8.3, "total": 8900 },
					"eps": 24
				}
			]
		},
		{
			"weekday": { "en": "Tue", "cn": "星期二", "ja": "火曜", "id": 2 },
			"items": [
				{
					"id": 465220,
					"name": "ダンダダン",
					"name_cn": "胆大党",
					"summary": "坚信幽灵存在的女子高生与笃信外星人的少年相遇展开的奇幻战斗物语。",
					"images": { "large": "https://lain.bgm.tv/pic/cover/l/d1/8a/465220_FkKkx.jpg", "common": "https://lain.bgm.tv/r/400/pic/cover/l/d1/8a/465220_FkKkx.jpg" },
					"rating": { "score": 8.1, "total": 4500 },
					"eps": 12
				},
				{
					"id": 467389,
					"name": "負けヒロインが多すぎる！",
					"name_cn": "败犬女主也太多了！",
					"summary": "被心仪男生甩掉的败犬女主角们与男主的青春恋爱喜剧。",
					"images": { "large": "https://lain.bgm.tv/pic/cover/l/ef/f1/467389_oPqU8.jpg", "common": "https://lain.bgm.tv/r/400/pic/cover/l/ef/f1/467389_oPqU8.jpg" },
					"rating": { "score": 8.2, "total": 7800 },
					"eps": 12
				}
			]
		}
	]`
	var res any
	_ = json.Unmarshal([]byte(fallbackJSON), &res)
	return res
}
