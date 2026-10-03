package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	req.Header.Set("User-Agent", "KazumiWeb/1.0 (https://github.com/Predidit/Kazumi)")
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

// GetCalendar 获取放送日历（新番时间表）
func (s *BangumiService) GetCalendar(ctx context.Context) (any, error) {
	// 优先请求标准的 api.bgm.tv/calendar
	data, err := s.fetchWithCache(ctx, "https://api.bgm.tv/calendar", 2*time.Hour)
	if err == nil && len(data) > 0 {
		var res any
		if jsonErr := json.Unmarshal(data, &res); jsonErr == nil {
			return res, nil
		}
	}

	// 降级使用内置兜底日历数据，避免用户卡死在骨架屏
	return getFallbackCalendar(), nil
}

// GetSubjectDetail 获取番剧详情
func (s *BangumiService) GetSubjectDetail(ctx context.Context, subjectID string) (any, error) {
	apiURL := fmt.Sprintf("https://api.bgm.tv/v0/subjects/%s", subjectID)
	data, err := s.fetchWithCache(ctx, apiURL, 24*time.Hour)
	if err != nil {
		return nil, err
	}
	var res any
	err = json.Unmarshal(data, &res)
	return res, err
}

// GetSubjectCharacters 获取番剧角色
func (s *BangumiService) GetSubjectCharacters(ctx context.Context, subjectID string) (any, error) {
	apiURL := fmt.Sprintf("https://api.bgm.tv/v0/subjects/%s/characters", subjectID)
	data, err := s.fetchWithCache(ctx, apiURL, 24*time.Hour)
	if err != nil {
		return nil, err
	}
	var res any
	err = json.Unmarshal(data, &res)
	return res, err
}

// SearchSubjects 搜索番剧
func (s *BangumiService) SearchSubjects(ctx context.Context, keyword string) (any, error) {
	apiURL := fmt.Sprintf("https://api.bgm.tv/search/subject/%s?type=2&responseGroup=large", url.PathEscape(keyword))
	data, err := s.fetchWithCache(ctx, apiURL, 30*time.Minute)
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
