package engine

import (
	"encoding/json"
	"fmt"
)

// RuleMode 定义规则解析模式
type RuleMode string

const (
	ModeXPath RuleMode = "xpath"
	ModeAPI   RuleMode = "api"
)

// ApiEpisodePageConfig API 模式下的集数跳转页面配置
type ApiEpisodePageConfig struct {
	URL   string            `json:"url"`
	Query map[string]string `json:"query,omitempty"`
}

// ApiRequestConfig API 模式下的请求配置
type ApiRequestConfig struct {
	URL      string            `json:"url"`
	Method   string            `json:"method"`
	Headers  map[string]string `json:"headers,omitempty"`
	BodyType string            `json:"bodyType,omitempty"`
	Body     any               `json:"body,omitempty"`
}

// ApiSearchConfig API 模式下的搜索规则配置
type ApiSearchConfig struct {
	Request       ApiRequestConfig `json:"request"`
	ItemsJsonPath string           `json:"itemsJsonPath"`
	ListPath      string           `json:"listPath"`
	NameJsonPath  string           `json:"nameJsonPath"`
	NamePath      string           `json:"namePath"`
	SrcJsonPath   string           `json:"srcJsonPath"`
	SourcePath    string           `json:"sourcePath"`
}

// ApiChapterConfig API 模式下的分集规则配置
type ApiChapterConfig struct {
	Request          ApiRequestConfig     `json:"request"`
	RoadsJsonPath    string               `json:"roadsJsonPath"`
	RoadsPath        string               `json:"roadsPath"`
	RoadNameJsonPath string               `json:"roadNameJsonPath"`
	RoadNamePath     string               `json:"roadNamePath"`
	UrlsJsonPath     string               `json:"urlsJsonPath"`
	EpisodeUrlPath   string               `json:"episodeUrlPath"`
	NamesJsonPath    string               `json:"namesJsonPath"`
	EpisodeNamePath  string               `json:"episodeNamePath"`
	EpisodePage      ApiEpisodePageConfig `json:"episodePage,omitempty"`
}

// Plugin 对应 Kazumi 原版规则定义模型
type Plugin struct {
	ID               string           `json:"id,omitempty" gorm:"primaryKey"`
	Api              string           `json:"api"`
	Type             string           `json:"type"`
	Name             string           `json:"name" gorm:"index"`
	Version          string           `json:"version"`
	MultiSources     bool             `json:"muliSources"`
	UseWebview       bool             `json:"useWebview"`
	UseNativePlayer  bool             `json:"useNativePlayer"`
	UsePost          bool             `json:"usePost"`
	UseLegacyParser  bool             `json:"useLegacyParser"`
	AdBlocker        bool             `json:"adBlocker"`
	UserAgent        string           `json:"userAgent"`
	BaseURL          string           `json:"baseURL"`
	SearchURL        string           `json:"searchURL"`
	SearchList       string           `json:"searchList"`
	SearchName       string           `json:"searchName"`
	SearchResult     string           `json:"searchResult"`
	ChapterRoads     string           `json:"chapterRoads"`
	ChapterResult    string           `json:"chapterResult"`
	Referer          string           `json:"referer"`
	SearchMode       string           `json:"searchMode"`
	ChapterMode      string           `json:"chapterMode"`
	SearchApiConfig  ApiSearchConfig  `json:"searchApiConfig,omitempty" gorm:"serializer:json"`
	ChapterApiConfig ApiChapterConfig `json:"chapterApiConfig,omitempty" gorm:"serializer:json"`
	Enabled          bool             `json:"enabled" gorm:"default:true"`
}

type pluginAlias Plugin

func (p *Plugin) UnmarshalJSON(data []byte) error {
	type rawPlugin struct {
		pluginAlias
		Api any `json:"api"`
	}
	var r rawPlugin
	if err := json.Unmarshal(data, &r); err != nil {
		return err
	}
	*p = Plugin(r.pluginAlias)
	if r.Api != nil {
		p.Api = fmt.Sprintf("%v", r.Api)
	}
	return nil
}


// SearchItem 规则检索出来的单项番剧
type SearchItem struct {
	PluginName string `json:"pluginName"`
	Name       string `json:"name"`
	Src        string `json:"src"`
}

// Episode 某线路下的单个剧集
type Episode struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// Road 播放线路
type Road struct {
	Name       string    `json:"name"`
	Episodes   []Episode `json:"episodes"`
	Identifier []string  `json:"identifier"`
	Data       []string  `json:"data"`
}
