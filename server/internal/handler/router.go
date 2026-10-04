package handler

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"kazumi-web-server/internal/config"
	"kazumi-web-server/internal/database"
	"kazumi-web-server/internal/engine"
	"kazumi-web-server/internal/service"
)

type AppHandler struct {
	cfg            *config.Config
	guard          *service.ProxyGuard
	engine         *engine.Engine
	ruleSvc        *service.RuleService
	streamSvc      *service.StreamService
	streamResolver *service.StreamResolver
	bangumiSvc     *service.BangumiService
	danmakuSvc     *service.DanmakuService
	userDataSvc    *service.UserDataService
}

func NewAppHandler(
	cfg *config.Config,
	guard *service.ProxyGuard,
	eng *engine.Engine,
	ruleSvc *service.RuleService,
	streamSvc *service.StreamService,
	streamResolver *service.StreamResolver,
	bangumiSvc *service.BangumiService,
	danmakuSvc *service.DanmakuService,
	userDataSvc *service.UserDataService,
) *AppHandler {
	return &AppHandler{
		cfg:            cfg,
		guard:          guard,
		engine:         eng,
		ruleSvc:        ruleSvc,
		streamSvc:      streamSvc,
		streamResolver: streamResolver,
		bangumiSvc:     bangumiSvc,
		danmakuSvc:     danmakuSvc,
		userDataSvc:    userDataSvc,
	}
}

// rejectProxy 统一输出代理拒绝原因，供前端按 class 分类。
func (h *AppHandler) rejectProxy(c *gin.Context, err error) {
	c.Header("X-Kazumi-Error", service.ProxyErrorHeader(err))
	c.String(service.ProxyErrorStatus(err), "%v", err)
}

// guardProxy 校验签名与目标地址，返回 false 表示已写出错误响应。
func (h *AppHandler) guardProxy(c *gin.Context, rawURL, referer, ua string) bool {
	token := c.Query("token")
	if token == "" {
		if sig, exp := c.Query("sig"), c.Query("exp"); sig != "" && exp != "" {
			token = exp + "." + sig
		}
	}

	if !h.guard.RequireSignature() {
		log.Printf("[Kazumi Web] 警告: 代理签名校验已关闭 (PROXY_REQUIRE_SIGNATURE=false)，以开放代理模式转发: %s", rawURL)
	} else {
		if err := h.guard.Verify(rawURL, referer, ua, token); err != nil {
			h.rejectProxy(c, err)
			return false
		}
	}

	if err := h.guard.CheckURL(rawURL); err != nil {
		h.rejectProxy(c, err)
		return false
	}
	return true
}

// writeUpstreamError 处理上游状态异常 / 清单格式错误。
func (h *AppHandler) writeUpstreamError(c *gin.Context, err error) {
	var upstream *service.UpstreamStatusError
	if errors.As(err, &upstream) {
		if upstream.Status == http.StatusForbidden {
			c.Header("X-Kazumi-Error", "upstream_403")
		} else {
			c.Header("X-Kazumi-Error", "upstream_error")
		}
		c.Header("X-Kazumi-Upstream-Status", strconv.Itoa(upstream.Status))
		c.String(upstream.Status, "%v", err)
		return
	}
	if errors.Is(err, service.ErrNotManifest) {
		c.Header("X-Kazumi-Error", "not_manifest")
		c.String(http.StatusBadGateway, "目标地址返回的内容不是有效的 m3u8 清单")
		return
	}
	h.rejectProxy(c, err)
}

func SetupRouter(h *AppHandler) *gin.Engine {
	r := gin.Default()

	// 允许全来源跨域，方便前端与插件对接
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	corsConfig.AllowHeaders = []string{"*"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	r.Use(cors.New(corsConfig))

	api := r.Group("/api")
	{
		// 1. 规则管理
		rules := api.Group("/rules")
		{
			rules.GET("", h.listRules)
			rules.POST("", h.saveRule)
			rules.DELETE("/:id", h.deleteRule)
			rules.PATCH("/:id/toggle", h.toggleRule)
			rules.GET("/market", h.getMarketRules)
			rules.POST("/market/install", h.installMarketRule)
		}

		// 2. 搜索与采集
		api.GET("/search", h.search)
		api.GET("/chapters", h.queryChapters)

		// 3. 流媒体反代与智能嗅探
		stream := api.Group("/stream")
		{
			stream.GET("/resolve", h.resolveStream)
			stream.GET("/m3u8", h.proxyM3U8)
			stream.HEAD("/m3u8", h.proxyM3U8)
			stream.GET("/segment", h.proxySegment)
			stream.HEAD("/segment", h.proxySegment)
		}

		// 4. Bangumi 番剧数据代理
		bangumi := api.Group("/bangumi")
		{
			bangumi.GET("/calendar", h.getCalendar)
			bangumi.GET("/subject/:id", h.getSubjectDetail)
			bangumi.GET("/subject/:id/characters", h.getSubjectCharacters)
			bangumi.GET("/search", h.searchBangumi)
			bangumi.GET("/ping", h.pingBangumiMirror)
		}

		// 5. 弹弹play 弹幕代理
		danmaku := api.Group("/danmaku")
		{
			danmaku.GET("/episodes", h.searchDanmakuEpisodes)
			danmaku.GET("/comments", h.getDanmakuComments)
		}

		// 6. 观看历史与收藏
		user := api.Group("/user")
		{
			user.GET("/history", h.getHistories)
			user.POST("/history", h.saveHistory)
			user.DELETE("/history/:id", h.deleteHistory)
			user.DELETE("/history", h.clearHistories)

			user.GET("/collect", h.getCollects)
			user.POST("/collect", h.saveCollect)
			user.DELETE("/collect/:id", h.deleteCollect)
		}
	}

	// 纯 API 服务：不再托管前端静态资源，也不再做 SPA 路由回退。
	// 任何未匹配的路径统一返回 JSON 404。
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	return r
}

// 规则 Handlers
func (h *AppHandler) listRules(c *gin.Context) {
	list, err := h.ruleSvc.ListPlugins()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) saveRule(c *gin.Context) {
	var p engine.Plugin
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.ruleSvc.SavePlugin(&p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *AppHandler) deleteRule(c *gin.Context) {
	id := c.Param("id")
	if err := h.ruleSvc.DeletePlugin(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AppHandler) toggleRule(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.ruleSvc.TogglePlugin(id, req.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AppHandler) getMarketRules(c *gin.Context) {
	items, err := h.ruleSvc.FetchMarketPlugins(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *AppHandler) installMarketRule(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	plugin, err := h.ruleSvc.InstallFromMarket(c.Request.Context(), req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, plugin)
}

// 搜索与章节 Handlers
func (h *AppHandler) search(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "keyword 不能为空"})
		return
	}

	ruleID := c.Query("ruleId")
	if ruleID != "" {
		p, err := h.ruleSvc.GetPlugin(ruleID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "规则不存在"})
			return
		}
		items, err := h.engine.Search(c.Request.Context(), p, keyword)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, items)
		return
	}

	// 多规则并发搜索
	plugins, err := h.ruleSvc.ListPlugins()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := h.engine.SearchMulti(c.Request.Context(), plugins, keyword)
	c.JSON(http.StatusOK, items)
}

func (h *AppHandler) queryChapters(c *gin.Context) {
	ruleID := c.Query("ruleId")
	detailURL := c.Query("url")
	if detailURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url 不能为空"})
		return
	}

	plugins, err := h.ruleSvc.ListPlugins()
	if err != nil || len(plugins) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无可用规则"})
		return
	}

	var targetPlugin *engine.Plugin
	if ruleID != "" {
		for _, p := range plugins {
			if p.ID == ruleID || strings.EqualFold(p.Name, ruleID) {
				targetPlugin = p
				break
			}
		}
	}
	if targetPlugin == nil {
		// 根据 URL 域名推断匹配规则
		for _, p := range plugins {
			if p.BaseURL != "" && strings.Contains(detailURL, p.BaseURL) {
				targetPlugin = p
				break
			}
		}
	}
	if targetPlugin == nil {
		targetPlugin = plugins[0]
	}

	roads, err := h.engine.QueryChapters(c.Request.Context(), targetPlugin, detailURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"plugin": targetPlugin,
		"roads":  roads,
	})
}

// 流媒体代理与嗅探 Handlers
func (h *AppHandler) resolveStream(c *gin.Context) {
	rawURL := c.Query("url")
	if rawURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url 不能为空"})
		return
	}
	referer := c.Query("referer")
	ua := c.Query("ua")

	resolved, err := h.streamResolver.Resolve(c.Request.Context(), rawURL, referer, ua)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resolved)
}

func (h *AppHandler) proxyM3U8(c *gin.Context) {
	rawURL := c.Query("url")
	if rawURL == "" {
		c.String(http.StatusBadRequest, "url 不能为空")
		return
	}
	referer := c.Query("referer")
	ua := c.Query("ua")

	if !h.guardProxy(c, rawURL, referer, ua) {
		return
	}

	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	proxyBase := scheme + "://" + c.Request.Host

	rewritten, err := h.streamSvc.RewriteM3U8(c.Request.Context(), rawURL, referer, ua, proxyBase)
	if err != nil {
		h.writeUpstreamError(c, err)
		return
	}

	c.Header("Content-Type", "application/vnd.apple.mpegurl")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Cache-Control", "no-store")
	c.String(http.StatusOK, rewritten)
}

func (h *AppHandler) proxySegment(c *gin.Context) {
	rawURL := c.Query("url")
	if rawURL == "" {
		c.String(http.StatusBadRequest, "url 不能为空")
		return
	}
	referer := c.Query("referer")
	ua := c.Query("ua")

	if !h.guardProxy(c, rawURL, referer, ua) {
		return
	}

	err := h.streamSvc.ProxySegment(c.Request.Context(), c.Request.Method, rawURL, referer, ua, c.Request.Header, c.Writer)
	if err != nil {
		if c.Writer.Written() {
			// 已开始下发内容（通常是中途断流）：断连让播放器看到网络错误而不是"成功但空"
			panic(http.ErrAbortHandler)
		}
		h.writeUpstreamError(c, err)
		return
	}
}

// Bangumi Handlers
func (h *AppHandler) getCalendar(c *gin.Context) {
	mirror := c.Query("mirror")
	data, err := h.bangumiSvc.GetCalendar(c.Request.Context(), mirror)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AppHandler) getSubjectDetail(c *gin.Context) {
	id := c.Param("id")
	mirror := c.Query("mirror")
	data, err := h.bangumiSvc.GetSubjectDetail(c.Request.Context(), id, mirror)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AppHandler) getSubjectCharacters(c *gin.Context) {
	id := c.Param("id")
	mirror := c.Query("mirror")
	data, err := h.bangumiSvc.GetSubjectCharacters(c.Request.Context(), id, mirror)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AppHandler) searchBangumi(c *gin.Context) {
	keyword := c.Query("keyword")
	mirror := c.Query("mirror")
	data, err := h.bangumiSvc.SearchSubjects(c.Request.Context(), keyword, mirror)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AppHandler) pingBangumiMirror(c *gin.Context) {
	mirror := c.Query("mirror")
	result := h.bangumiSvc.PingMirror(c.Request.Context(), mirror)
	c.JSON(http.StatusOK, result)
}

// 弹幕 Handlers
func (h *AppHandler) searchDanmakuEpisodes(c *gin.Context) {
	title := c.Query("title")
	data, err := h.danmakuSvc.SearchEpisodes(c.Request.Context(), title)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AppHandler) getDanmakuComments(c *gin.Context) {
	episodeID := c.Query("episodeId")
	data, err := h.danmakuSvc.GetComments(c.Request.Context(), episodeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// 历史记录与收藏 Handlers
func (h *AppHandler) getHistories(c *gin.Context) {
	list, err := h.userDataSvc.GetHistories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) saveHistory(c *gin.Context) {
	var item database.History
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.userDataSvc.SaveHistory(&item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *AppHandler) deleteHistory(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	if err := h.userDataSvc.DeleteHistory(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AppHandler) clearHistories(c *gin.Context) {
	if err := h.userDataSvc.ClearHistories(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *AppHandler) getCollects(c *gin.Context) {
	list, err := h.userDataSvc.GetCollects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AppHandler) saveCollect(c *gin.Context) {
	var item database.Collect
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.userDataSvc.SaveCollect(&item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *AppHandler) deleteCollect(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	if err := h.userDataSvc.DeleteCollect(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
