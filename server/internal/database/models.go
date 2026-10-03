package database

import (
	"time"

	"kazumi-web-server/internal/engine"
)

// History 观看历史
type History struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	BangumiName string    `gorm:"index" json:"bangumiName"`
	EpisodeName string    `json:"episodeName"`
	EpisodeURL  string    `gorm:"uniqueIndex" json:"episodeUrl"`
	CoverURL    string    `json:"coverUrl"`
	PositionMs  int64     `json:"positionMs"`
	DurationMs  int64     `json:"durationMs"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Collect 追番收藏
type Collect struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	BangumiID   int       `gorm:"uniqueIndex" json:"bangumiId"`
	BangumiName string    `json:"bangumiName"`
	CoverURL    string    `json:"coverUrl"`
	Summary     string    `json:"summary"`
	Status      int       `json:"status"` // 1: 想看, 2: 在看, 3: 看过
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Setting 键值对系统配置
type Setting struct {
	Key       string    `gorm:"primaryKey" json:"key"`
	Value     string    `json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// PluginRecord 规则持久化记录
type PluginRecord = engine.Plugin
