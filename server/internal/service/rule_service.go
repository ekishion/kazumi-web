package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"

	"kazumi-web-server/internal/engine"
)

type MarketRuleItem struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Type    string `json:"type"`
	Author  string `json:"author,omitempty"`
}

type RuleService struct {
	db     *gorm.DB
	client *http.Client
}

func NewRuleService(db *gorm.DB) *RuleService {
	return &RuleService{
		db: db,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (s *RuleService) ListPlugins() ([]*engine.Plugin, error) {
	plugins := make([]*engine.Plugin, 0)
	err := s.db.Find(&plugins).Error
	return plugins, err
}

func (s *RuleService) GetPlugin(id string) (*engine.Plugin, error) {
	var p engine.Plugin
	err := s.db.First(&p, "id = ?", id).Error
	return &p, err
}

func (s *RuleService) SavePlugin(p *engine.Plugin) error {
	if p.ID == "" {
		p.ID = strings.ToLower(strings.ReplaceAll(p.Name, " ", "_"))
	}
	return s.db.Save(p).Error
}

func (s *RuleService) DeletePlugin(id string) error {
	return s.db.Delete(&engine.Plugin{}, "id = ?", id).Error
}

func (s *RuleService) TogglePlugin(id string, enabled bool) error {
	return s.db.Model(&engine.Plugin{}).Where("id = ?", id).Update("enabled", enabled).Error
}

// FetchMarketPlugins 从官方规则仓库拉取规则索引
func (s *RuleService) FetchMarketPlugins(ctx context.Context) ([]MarketRuleItem, error) {
	urls := []string{
		"https://raw.githubusercontent.com/Predidit/KazumiRules/main/index.json",
		"https://raw.gitcode.com/gh_mirrors/ka/KazumiRules/raw/main/index.json",
	}

	var body []byte
	var err error
	for _, u := range urls {
		req, rErr := http.NewRequestWithContext(ctx, "GET", u, nil)
		if rErr != nil {
			err = rErr
			continue
		}
		resp, dErr := s.client.Do(req)
		if dErr != nil {
			err = dErr
			continue
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			body, err = io.ReadAll(resp.Body)
			if err == nil && len(body) > 0 {
				break
			}
		}
	}

	if len(body) == 0 {
		return nil, fmt.Errorf("拉取规则市场失败: %v", err)
	}

	var items []MarketRuleItem
	err = json.Unmarshal(body, &items)
	return items, err
}

// InstallFromMarket 从官方规则仓库下载单条规则并持久化入库
func (s *RuleService) InstallFromMarket(ctx context.Context, name string) (*engine.Plugin, error) {
	urls := []string{
		fmt.Sprintf("https://raw.githubusercontent.com/Predidit/KazumiRules/main/%s.json", name),
		fmt.Sprintf("https://raw.gitcode.com/gh_mirrors/ka/KazumiRules/raw/main/%s.json", name),
	}

	var body []byte
	var err error
	for _, u := range urls {
		req, rErr := http.NewRequestWithContext(ctx, "GET", u, nil)
		if rErr != nil {
			err = rErr
			continue
		}
		resp, dErr := s.client.Do(req)
		if dErr != nil {
			err = dErr
			continue
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			body, err = io.ReadAll(resp.Body)
			if err == nil && len(body) > 0 {
				break
			}
		}
	}

	if len(body) == 0 {
		return nil, fmt.Errorf("下载规则 %s 失败: %v", name, err)
	}

	var p engine.Plugin
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, fmt.Errorf("解析规则 JSON 失败: %w", err)
	}

	p.ID = strings.ToLower(strings.ReplaceAll(p.Name, " ", "_"))
	p.Enabled = true
	if err := s.SavePlugin(&p); err != nil {
		return nil, err
	}

	return &p, nil
}
