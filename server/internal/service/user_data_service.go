package service

import (
	"time"

	"gorm.io/gorm"

	"kazumi-web-server/internal/database"
)

type UserDataService struct {
	db *gorm.DB
}

func NewUserDataService(db *gorm.DB) *UserDataService {
	return &UserDataService{db: db}
}

// 历史记录
func (s *UserDataService) GetHistories() ([]database.History, error) {
	list := make([]database.History, 0)
	err := s.db.Order("updated_at desc").Find(&list).Error
	return list, err
}

func (s *UserDataService) SaveHistory(h *database.History) error {
	var existing database.History
	err := s.db.Where("episode_url = ?", h.EpisodeURL).First(&existing).Error
	if err == nil {
		h.ID = existing.ID
	}
	h.UpdatedAt = time.Now()
	return s.db.Save(h).Error
}

func (s *UserDataService) DeleteHistory(id uint) error {
	return s.db.Delete(&database.History{}, id).Error
}

func (s *UserDataService) ClearHistories() error {
	return s.db.Exec("DELETE FROM histories").Error
}

// 追番收藏
func (s *UserDataService) GetCollects() ([]database.Collect, error) {
	list := make([]database.Collect, 0)
	err := s.db.Order("updated_at desc").Find(&list).Error
	return list, err
}

func (s *UserDataService) SaveCollect(c *database.Collect) error {
	var existing database.Collect
	err := s.db.Where("bangumi_id = ?", c.BangumiID).First(&existing).Error
	if err == nil {
		c.ID = existing.ID
	}
	c.UpdatedAt = time.Now()
	return s.db.Save(c).Error
}

func (s *UserDataService) DeleteCollect(bangumiID int) error {
	return s.db.Where("bangumi_id = ?", bangumiID).Delete(&database.Collect{}).Error
}

func (s *UserDataService) IsCollected(bangumiID int) (bool, error) {
	var count int64
	err := s.db.Model(&database.Collect{}).Where("bangumi_id = ?", bangumiID).Count(&count).Error
	return count > 0, err
}
