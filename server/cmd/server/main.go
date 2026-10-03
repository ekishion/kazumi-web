package main

import (
	"log"

	"kazumi-web-server/internal/config"
	"kazumi-web-server/internal/database"
	"kazumi-web-server/internal/engine"
	"kazumi-web-server/internal/handler"
	"kazumi-web-server/internal/service"
)

func main() {
	cfg := config.LoadConfig()
	log.Printf("[Kazumi Web] Starting server on port :%s ...", cfg.Port)

	db, err := database.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	eng := engine.NewEngine()
	proxyGuard := service.NewProxyGuard(cfg)
	ruleSvc := service.NewRuleService(db)
	streamSvc := service.NewStreamService(cfg, proxyGuard)
	streamResolver := service.NewStreamResolver(cfg, proxyGuard)
	bangumiSvc := service.NewBangumiService()
	danmakuSvc := service.NewDanmakuService()
	userDataSvc := service.NewUserDataService(db)

	h := handler.NewAppHandler(
		cfg,
		proxyGuard,
		eng,
		ruleSvc,
		streamSvc,
		streamResolver,
		bangumiSvc,
		danmakuSvc,
		userDataSvc,
	)

	// 纯 API 服务：静态前端资源不再由本服务托管，
	// 请通过 dev server / 静态托管 + 反代 /api 的方式接入前端。
	router := handler.SetupRouter(h)

	log.Printf("[Kazumi Web] Server listening at http://localhost:%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server stopped with error: %v", err)
	}
}
