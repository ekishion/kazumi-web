package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tidwall/gjson"
)

type ApiEngine struct {
	client *http.Client
}

func NewApiEngine() *ApiEngine {
	return &ApiEngine{
		client: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (e *ApiEngine) Search(ctx context.Context, plugin *Plugin, keyword string) ([]SearchItem, error) {
	apiConfig := plugin.SearchApiConfig
	if apiConfig.Request.URL == "" {
		return nil, fmt.Errorf("搜索 API 配置中 URL 为空")
	}

	searchURL := strings.ReplaceAll(apiConfig.Request.URL, "@keyword", url.QueryEscape(keyword))
	searchURL = NormalizeURL(plugin.BaseURL, searchURL)

	method := strings.ToUpper(apiConfig.Request.Method)
	if method == "" {
		method = "GET"
	}

	var bodyReader io.Reader
	if reqBody := formatRequestBody(apiConfig.Request.Body, "@keyword", keyword); reqBody != "" {
		bodyReader = strings.NewReader(reqBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, searchURL, bodyReader)
	if err != nil {
		return nil, err
	}

	for k, v := range apiConfig.Request.Headers {
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		if plugin.UserAgent != "" {
			req.Header.Set("User-Agent", plugin.UserAgent)
		} else {
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		}
	}

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("API 搜索请求失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	rawJSON := string(bodyBytes)
	itemsPath := cleanJsonPath(firstNonEmpty(apiConfig.ItemsJsonPath, apiConfig.ListPath))
	namePath := cleanJsonPath(firstNonEmpty(apiConfig.NameJsonPath, apiConfig.NamePath))
	srcPath := cleanJsonPath(firstNonEmpty(apiConfig.SrcJsonPath, apiConfig.SourcePath))

	itemsResult := gjson.Get(rawJSON, itemsPath)
	if !itemsResult.IsArray() {
		return nil, fmt.Errorf("JSONPath 未解析到数组: %s", itemsPath)
	}

	var results []SearchItem
	itemsResult.ForEach(func(key, value gjson.Result) bool {
		name := value.Get(namePath).String()
		src := value.Get(srcPath).String()
		if name != "" && src != "" {
			results = append(results, SearchItem{
				PluginName: plugin.Name,
				Name:       strings.TrimSpace(name),
				Src:        NormalizeURL(plugin.BaseURL, strings.TrimSpace(src)),
			})
		}
		return true
	})

	return results, nil
}

func (e *ApiEngine) QueryChapters(ctx context.Context, plugin *Plugin, detailURL string) ([]Road, error) {
	apiConfig := plugin.ChapterApiConfig
	if apiConfig.Request.URL == "" {
		return nil, fmt.Errorf("分集 API 配置中 URL 为空")
	}

	targetURL := strings.ReplaceAll(apiConfig.Request.URL, "@source", detailURL)
	targetURL = NormalizeURL(plugin.BaseURL, targetURL)

	method := strings.ToUpper(apiConfig.Request.Method)
	if method == "" {
		method = "GET"
	}

	var bodyReader io.Reader
	if reqBody := formatRequestBody(apiConfig.Request.Body, "@source", detailURL); reqBody != "" {
		bodyReader = strings.NewReader(reqBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
	if err != nil {
		return nil, err
	}

	for k, v := range apiConfig.Request.Headers {
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		if plugin.UserAgent != "" {
			req.Header.Set("User-Agent", plugin.UserAgent)
		} else {
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		}
	}

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("分集 API 请求失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	rawJSON := string(bodyBytes)
	roadsPath := cleanJsonPath(firstNonEmpty(apiConfig.RoadsJsonPath, apiConfig.RoadsPath))
	roadNamePath := cleanJsonPath(firstNonEmpty(apiConfig.RoadNameJsonPath, apiConfig.RoadNamePath))
	urlsPath := cleanJsonPath(firstNonEmpty(apiConfig.UrlsJsonPath, apiConfig.EpisodeUrlPath))
	namesPath := cleanJsonPath(firstNonEmpty(apiConfig.NamesJsonPath, apiConfig.EpisodeNamePath))

	roadsResult := gjson.Get(rawJSON, roadsPath)
	var roads []Road

	if roadsResult.IsArray() {
		roadsResult.ForEach(func(key, value gjson.Result) bool {
			roadName := value.Get(roadNamePath).String()
			if roadName == "" {
				roadName = fmt.Sprintf("播放线路 %d", len(roads)+1)
			}

			urlsResult := value.Get(urlsPath)
			namesResult := value.Get(namesPath)

			var episodes []Episode
			var urls []string
			var names []string

			if urlsResult.IsArray() {
				idx := 0
				urlsResult.ForEach(func(uKey, uVal gjson.Result) bool {
					u := uVal.String()
					n := fmt.Sprintf("第%d集", idx+1)
					if namesResult.IsArray() {
						namesArr := namesResult.Array()
						if idx < len(namesArr) {
							n = namesArr[idx].String()
						}
					}
					fullURL := NormalizeURL(plugin.BaseURL, u)
					episodes = append(episodes, Episode{Name: n, URL: fullURL})
					urls = append(urls, fullURL)
					names = append(names, n)
					idx++
					return true
				})
			}

			if len(episodes) > 0 {
				roads = append(roads, Road{
					Name:       roadName,
					Episodes:   episodes,
					Identifier: names,
					Data:       urls,
				})
			}
			return true
		})
	}

	return roads, nil
}

func cleanJsonPath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "$.")
	p = strings.TrimPrefix(p, "$")
	return p
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func formatRequestBody(body any, placeholder, value string) string {
	if body == nil {
		return ""
	}
	switch v := body.(type) {
	case string:
		return strings.ReplaceAll(v, placeholder, value)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return strings.ReplaceAll(string(b), placeholder, value)
	}
}

