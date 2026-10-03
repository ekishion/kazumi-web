package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/tidwall/gjson"
)

type DanmakuItem struct {
	Time  float64 `json:"time"`
	Mode  int     `json:"mode"` // 0: 滚动, 1: 顶部, 2: 底部 (ArtPlayer)
	Type  int     `json:"type"` // 兼容字段
	Color string  `json:"color"`
	Text  string  `json:"text"`
}

type DanmakuService struct {
	client    *http.Client
	endpoint  string
	appID     string
	appSecret string
}

func NewDanmakuService() *DanmakuService {
	endpoint := os.Getenv("DANDAN_ENDPOINT")
	if endpoint == "" {
		endpoint = "https://ddplay.retr0.xyz" // 社区高可用免签代理端点
	}
	return &DanmakuService{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		endpoint:  strings.TrimRight(endpoint, "/"),
		appID:     os.Getenv("DANDAN_APPID"),
		appSecret: os.Getenv("DANDAN_KEY"),
	}
}

func (s *DanmakuService) signRequest(req *http.Request, path string) {
	if s.appID != "" && s.appSecret != "" && strings.Contains(s.endpoint, "dandanplay.net") {
		timestamp := strconv.FormatInt(time.Now().Unix(), 10)
		data := s.appID + timestamp + path + s.appSecret
		h := sha256.New()
		h.Write([]byte(data))
		signature := base64.StdEncoding.EncodeToString(h.Sum(nil))

		req.Header.Set("X-Auth", "1")
		req.Header.Set("X-AppId", s.appID)
		req.Header.Set("X-Timestamp", timestamp)
		req.Header.Set("X-Signature", signature)
	}
}

var cleanAnimeRe = regexp.MustCompile(`(?i)(?:\[[^\]]*\]|\([^\)]*\)|（[^）]*）|第[一二三四五六七八九十\d]+[季期部分]|Season\s*\d+|1080p|720p|4k|bdrip|hdrip|tc|ts|更新至.*|全\d+.*)`)

func cleanAnimeTitle(title string) string {
	cleaned := cleanAnimeRe.ReplaceAllString(title, " ")
	cleaned = strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(cleaned, " "))
	return cleaned
}

// searchInternal 内部单次查询剧集
func (s *DanmakuService) searchInternal(ctx context.Context, keyword string) (any, int, error) {
	path := "/api/v2/search/episodes"
	apiURL := fmt.Sprintf("%s%s?anime=%s", s.endpoint, path, url.QueryEscape(keyword))
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "KazumiWeb/1.0")
	req.Header.Set("Accept", "application/json")
	s.signRequest(req, path)

	resp, err := s.client.Do(req)
	if err != nil {
		return map[string]any{"animes": []any{}}, 0, nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || len(body) == 0 {
		return map[string]any{"animes": []any{}}, 0, nil
	}

	var res any
	if err := json.Unmarshal(body, &res); err != nil {
		return map[string]any{"animes": []any{}}, 0, nil
	}

	animeCount := len(gjson.GetBytes(body, "animes").Array())
	return res, animeCount, nil
}

// SearchEpisodes 根据番剧名在弹弹play搜索剧集匹配列表（支持智能去噪重试）
func (s *DanmakuService) SearchEpisodes(ctx context.Context, animeTitle string) (any, error) {
	rawTitle := strings.TrimSpace(animeTitle)
	if rawTitle == "" {
		return map[string]any{"animes": []any{}}, nil
	}

	res, count, err := s.searchInternal(ctx, rawTitle)
	if err != nil || count > 0 {
		return res, err
	}

	// 尝试去噪搜索（去除 "第一季"、"1080P" 等干扰项）
	cleaned := cleanAnimeTitle(rawTitle)
	if cleaned != "" && cleaned != rawTitle {
		resCleaned, countCleaned, errCleaned := s.searchInternal(ctx, cleaned)
		if errCleaned == nil && countCleaned > 0 {
			return resCleaned, nil
		}
	}

	// 若包含空格或连字符，尝试截取主标题
	parts := strings.FieldsFunc(rawTitle, func(r rune) bool {
		return r == ' ' || r == '-' || r == '—' || r == '_'
	})
	if len(parts) > 1 && len(parts[0]) >= 2 {
		resPrimary, countPrimary, errPrimary := s.searchInternal(ctx, parts[0])
		if errPrimary == nil && countPrimary > 0 {
			return resPrimary, nil
		}
	}

	return res, nil
}

// GetComments 根据弹弹play的 episodeId 获取弹幕列表并格式化
func (s *DanmakuService) GetComments(ctx context.Context, episodeID string) ([]DanmakuItem, error) {
	path := fmt.Sprintf("/api/v2/comment/%s", episodeID)
	apiURL := fmt.Sprintf("%s%s?withRelated=true", s.endpoint, path)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return []DanmakuItem{}, nil
	}
	req.Header.Set("User-Agent", "KazumiWeb/1.0")
	s.signRequest(req, path)

	resp, err := s.client.Do(req)
	if err != nil {
		return []DanmakuItem{}, nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || len(body) == 0 {
		return []DanmakuItem{}, nil
	}

	comments := gjson.GetBytes(body, "comments")
	var items []DanmakuItem

	if comments.IsArray() {
		comments.ForEach(func(key, val gjson.Result) bool {
			p := val.Get("p").String()
			m := val.Get("m").String()

			timeSec := 0.0
			danmakuType := 0
			colorInt := 16777215

			var sender string
			_, _ = fmt.Sscanf(p, "%f,%d,%d,%s", &timeSec, &danmakuType, &colorInt, &sender)

			hexColor := fmt.Sprintf("#%06X", colorInt)
			if hexColor == "#000000" {
				hexColor = "#FFFFFF"
			}

			// 映射 DanDanPlay 的 1/4/5 为 ArtPlayer 的 0/2/1
			artMode := 0
			switch danmakuType {
			case 4:
				artMode = 2 // 底部
			case 5:
				artMode = 1 // 顶部
			default:
				artMode = 0 // 滚动
			}

			items = append(items, DanmakuItem{
				Time:  timeSec,
				Mode:  artMode,
				Type:  danmakuType,
				Color: hexColor,
				Text:  m,
			})
			return true
		})
	}

	return items, nil
}
