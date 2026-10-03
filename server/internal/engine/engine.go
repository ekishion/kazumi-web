package engine

import (
	"context"
	"sync"
)

type Engine struct {
	xpathEngine *XPathEngine
	apiEngine   *ApiEngine
}

func NewEngine() *Engine {
	return &Engine{
		xpathEngine: NewXPathEngine(),
		apiEngine:   NewApiEngine(),
	}
}

// Search 根据规则模式路由执行单源搜索
func (e *Engine) Search(ctx context.Context, plugin *Plugin, keyword string) ([]SearchItem, error) {
	if plugin.SearchMode == string(ModeAPI) {
		return e.apiEngine.Search(ctx, plugin, keyword)
	}
	return e.xpathEngine.Search(ctx, plugin, keyword)
}

// QueryChapters 根据规则模式路由执行线路与剧集解析
func (e *Engine) QueryChapters(ctx context.Context, plugin *Plugin, detailURL string) ([]Road, error) {
	if plugin.ChapterMode == string(ModeAPI) {
		return e.apiEngine.QueryChapters(ctx, plugin, detailURL)
	}
	return e.xpathEngine.QueryChapters(ctx, plugin, detailURL)
}

// SearchMulti 并发对所有启用的规则进行搜索
func (e *Engine) SearchMulti(ctx context.Context, plugins []*Plugin, keyword string) []SearchItem {
	var wg sync.WaitGroup
	var mu sync.Mutex
	allResults := make([]SearchItem, 0)

	for _, p := range plugins {
		if !p.Enabled {
			continue
		}
		wg.Add(1)
		go func(plugin *Plugin) {
			defer wg.Done()
			items, err := e.Search(ctx, plugin, keyword)
			if err == nil && len(items) > 0 {
				mu.Lock()
				allResults = append(allResults, items...)
				mu.Unlock()
			}
		}(p)
	}

	wg.Wait()
	return allResults
}
