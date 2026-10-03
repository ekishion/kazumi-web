package database

import (
	"log"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"kazumi-web-server/internal/config"
	"kazumi-web-server/internal/engine"
)

var DB *gorm.DB

func InitDB(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	err = db.AutoMigrate(
		&History{},
		&Collect{},
		&Setting{},
		&engine.Plugin{},
	)
	if err != nil {
		return nil, err
	}

	DB = db
	seedDefaultData(db)
	return db, nil
}

func seedDefaultData(db *gorm.DB) {
	var count int64
	db.Model(&engine.Plugin{}).Count(&count)
	if count == 0 {
		// 插入默认初始示例规则（方便初次启动立即可用）
		defaultPlugin := engine.Plugin{
			ID:              "seed_cycanime",
			Api:             "8",
			Type:            "anime",
			Name:            "次元城动漫 (Demo)",
			Version:         "1.0.0",
			MultiSources:    true,
			UseWebview:      false,
			UseNativePlayer: true,
			BaseURL:         "https://www.cycanime.com",
			SearchURL:       "https://www.cycanime.com/search/-------------/?wd=@keyword",
			SearchList:      "//div[contains(@class,'hl-list-item')]",
			SearchName:      "//a[contains(@class,'hl-item-title')]",
			SearchResult:    "//a[contains(@class,'hl-item-title')]",
			ChapterRoads:    "//ul[contains(@class,'hl-plays-list')]",
			ChapterResult:   "//li/a",
			SearchMode:      "xpath",
			ChapterMode:     "xpath",
			Enabled:         true,
		}
		if err := db.Create(&defaultPlugin).Error; err != nil {
			log.Printf("初始化默认规则失败: %v", err)
		}
	}
}
