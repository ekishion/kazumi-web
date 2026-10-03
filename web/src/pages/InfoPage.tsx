import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Fade,
  Fab,
  IconButton,
  LinearProgress,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ArrowLeft,
  MessagesSquare,
  MoreHorizontal,
  Play,
  RefreshCw,
  Users,
  Waypoints,
} from 'lucide-react';

import { apiService } from '../api/client';
import { cached, invalidate, peek } from '../data/requestCache';
import { usePageScroll } from '../components/Layout/PageScrollContext';
import { KzInfoHeroCard } from '../components/KzInfoHeroCard';
import { KzInfoCharacterList } from '../components/KzInfoCharacterList';
import { useAppStore } from '../stores/useAppStore';
import type { CollectRecord, Plugin, Road, SearchItem } from '../types';

/**
 * 番剧详情，对齐原版 `Kazumi/lib/pages/info/info_page.dart` + `info_tabview.dart`：
 *  - 顶栏（SliverAppBar.medium）：返回 / 标题（溢出后淡入）/ 更多；TabBar 无分隔线
 *  - 头图卡片见 KzInfoHeroCard（模糊海报背景 + Hero 共享元素 kz-poster-<id>）
 *  - 概览：简介（18px，超过 7 行折叠为 120 高 + 加载更多/更少）→ 标签（ActionChip）→ 播放来源
 *  - Tab 指示器 M3 200–250ms；面板切换 150ms 淡入
 *  - 数据请求走 cached/peek（key: info:<id>…），仅首次加载显示骨架，不使用整页转圈
 */

const INFO_TABS = ['概览', '吐槽', '角色', '关联', '制作人员'];
/** 原版 info_tabview.dart：简介折叠高度 120 */
const SUMMARY_COLLAPSED_HEIGHT = 120;
const CONTENT_MAX_WIDTH = 950;
/** 原版 ActionChip：标签最多 12 个 + 「更多 +」 */
const TAGS_PREVIEW = 12;

/** M3 状态层：hover 叠加 8% 前景色 */
const stateLayer = (color: string, opacity = 0.08) =>
  `linear-gradient(${alpha(color, opacity)}, ${alpha(color, opacity)})`;

/**
 * 从推荐页 / 时间表的日历缓存里找同 id 的海报与标题作为首屏占位。
 * 目的：详情未返回时头图元素就已存在，保证 View Transitions 的共享元素 morph 能发生。
 */
function posterHint(subjectId: string): { cover?: string; title?: string } {
  if (!subjectId) return {};
  for (const key of ['bangumi:calendar', 'timeline:calendar']) {
    const days = peek<any[]>(key);
    if (!Array.isArray(days)) continue;
    for (const day of days) {
      const items = Array.isArray(day?.items) ? day.items : [];
      const hit = items.find((item: any) => String(item?.id) === subjectId);
      if (hit) {
        return {
          title: hit.name_cn || hit.name,
          cover: hit.images?.large || hit.images?.common || hit.images?.medium,
        };
      }
    }
  }
  return {};
}

const EmptyPane: React.FC<{ icon: React.ReactNode; title: string; hint: string }> = ({
  icon,
  title,
  hint,
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        textAlign: 'center',
      }}
    >
      <Box sx={{ color: theme.m3.onSurfaceVariant }}>{icon}</Box>
      <Typography sx={{ fontSize: 16, lineHeight: '24px', color: theme.m3.onSurface }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 14, lineHeight: '20px', color: theme.m3.onSurfaceVariant }}>
        {hint}
      </Typography>
    </Box>
  );
};

export const InfoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const pageScroll = usePageScroll();
  const { setPlayingContext, setAvailableSources } = useAppStore();

  const subjectId = id ?? '';
  const detailKey = `info:${subjectId}`;
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [scrolled, setScrolled] = useState(false);
  const [subject, setSubject] = useState<any | null>(() => peek<any>(detailKey) ?? null);
  const [loading, setLoading] = useState(() => peek<any>(detailKey) === undefined);
  const [collectStatus, setCollectStatus] = useState<number>(() => {
    const list = peek<CollectRecord[]>('info:collects');
    return list?.find((item) => String(item.bangumiId) === String(id))?.status ?? 0;
  });
  const [activeTab, setActiveTab] = useState(0);
  const [expandSummary, setExpandSummary] = useState(false);
  const [expandTags, setExpandTags] = useState(false);

  // 播放来源与分集（Web 版把原版的 SourceSheet 收进概览页）
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SearchItem | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [roads, setRoads] = useState<Road[]>([]);
  const [loadingRoads, setLoadingRoads] = useState(false);
  const [activeRoadIndex, setActiveRoadIndex] = useState(0);

  const title = subject ? subject.name_cn || subject.name || '' : '';

  /** 首屏占位（仅在详情未就绪时用） */
  const hint = useMemo<{ cover?: string; title?: string }>(
    () => (!subject && loading ? posterHint(subjectId) : {}),
    [loading, subject, subjectId],
  );

  /* --------------------------- 顶栏标题：滚动淡入 --------------------------- */
  useEffect(() => {
    // 外壳只为 4 个常驻标签页提供 PageScrollContext；/info 是全屏推入路由，
    // 因此回退到外壳的 .kz-scroll 容器（页面本身不再套 overflow 容器）
    const el =
      pageScroll?.current ?? (rootRef.current?.closest('.kz-scroll') as HTMLElement | null);
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [pageScroll]);

  /* ------------------------------- 番剧详情 ------------------------------- */
  useEffect(() => {
    if (!subjectId) return;
    // 同一实例切换 id 时重置状态
    setSubject(peek<any>(detailKey) ?? null);
    setLoading(peek<any>(detailKey) === undefined);
    setSearchItems([]);
    setSelectedSource(null);
    setRoads([]);
    setActiveRoadIndex(0);
    setActiveTab(0);
    setExpandSummary(false);
    setExpandTags(false);
  }, [detailKey, subjectId]);

  useEffect(() => {
    if (!subjectId) return;
    let alive = true;
    cached(detailKey, () => apiService.getSubjectDetail(subjectId))
      .then((data) => {
        if (!alive) return;
        if (data && (data as any).id) setSubject(data);
      })
      .catch((err) => console.error('加载番剧详情失败:', err))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [detailKey, subjectId]);

  /* ------------------------------- 收藏状态 ------------------------------- */
  useEffect(() => {
    let alive = true;
    cached('info:collects', () => apiService.getCollects())
      .then((list) => {
        if (!alive) return;
        const found = (list || []).find((item) => String(item.bangumiId) === subjectId);
        setCollectStatus(found?.status ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [subjectId]);

  /* --------------------------- 播放来源与分集 --------------------------- */
  const loadChapters = useCallback(
    async (item: SearchItem) => {
      setSelectedSource(item);
      setLoadingRoads(true);
      try {
        const res = await cached(`info:${subjectId}:roads:${item.src}`, () =>
          apiService.queryChapters(item.src),
        );
        setSelectedPlugin(res?.plugin ?? null);
        setRoads(res?.roads ?? []);
        setActiveRoadIndex(0);
      } catch (err) {
        console.error('获取分集失败:', err);
        setSelectedPlugin(null);
        setRoads([]);
      } finally {
        setLoadingRoads(false);
      }
    },
    [subjectId],
  );

  const searchSources = useCallback(
    async (keyword: string) => {
      if (!keyword) return;
      const key = `info:${subjectId}:sources:${keyword}`;
      // 命中缓存时直接渲染，不显示检索中状态（切页/返回不闪烁）
      if (peek<SearchItem[]>(key) === undefined) setSearching(true);
      try {
        const list = await cached(key, () => apiService.search(keyword));
        const safeList = Array.isArray(list) ? list : [];
        setSearchItems(safeList);
        setAvailableSources(safeList);
        if (safeList.length > 0) {
          // 优先选用推荐的直链源（保持既有行为）
          const preferred =
            safeList.find((item) => /mxdm|baimao/i.test(item.pluginName)) || safeList[0];
          void loadChapters(preferred);
        }
      } catch (err) {
        console.error('搜索源失败:', err);
        setSearchItems([]);
      } finally {
        setSearching(false);
      }
    },
    [loadChapters, setAvailableSources, subjectId],
  );

  useEffect(() => {
    if (!subject) return;
    const keyword = subject.name_cn || subject.name;
    if (!keyword) return;
    void searchSources(keyword);
  }, [subject, searchSources]);

  const refreshSources = () => {
    const keyword = subject?.name_cn || subject?.name;
    if (!keyword) return;
    invalidate(`info:${subjectId}:sources:${keyword}`);
    invalidate(`info:${subjectId}:roads:`);
    void searchSources(keyword);
  };

  const handlePlayEpisode = (roadIdx = 0, epIdx = 0) => {
    if (!subject) return;
    setPlayingContext(
      subject.name_cn || subject.name,
      subject.images?.large || subject.images?.common || '',
      roads,
      roadIdx,
      epIdx,
      selectedSource,
      selectedPlugin,
    );
    navigate('/play');
  };

  const handleCollect = async (status: number) => {
    if (!subject) return;
    try {
      if (status === 0) {
        await apiService.deleteCollect(subject.id);
      } else {
        await apiService.saveCollect({
          bangumiId: subject.id,
          bangumiName: subject.name_cn || subject.name,
          coverUrl: subject.images?.large || subject.images?.common,
          summary: subject.summary,
          status,
        });
      }
      invalidate('info:collects');
      setCollectStatus(status);
    } catch (err) {
      console.error('更新追番状态失败:', err);
    }
  };

  if (!subjectId || (!subject && !loading)) {
    return (
      <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', px: '12px', textAlign: 'center', py: 12 }}>
        <Typography sx={{ fontSize: 22, lineHeight: '28px', mb: '16px', color: theme.m3.onSurface }}>
          未找到该番剧信息
        </Typography>
        <Button variant="contained" onClick={() => navigate(-1)}>
          返回上一页
        </Button>
      </Box>
    );
  }

  const summary: string = subject?.summary || '暂无详细简介';
  const summaryIsLong = (subject?.summary || '').length > 160;
  const tags: Array<{ name: string; count: number }> = Array.isArray(subject?.tags)
    ? subject.tags
    : [];
  const visibleTags = expandTags ? tags : tags.slice(0, TAGS_PREVIEW);
  const showMoreTags = !expandTags && tags.length > TAGS_PREVIEW;
  const episodes = roads[activeRoadIndex]?.episodes ?? [];

  const overview = (
    <Box>
      {/* 简介 */}
      <Typography sx={{ fontSize: 18, lineHeight: '28px', color: theme.m3.onSurface, mb: '8px' }}>
        简介
      </Typography>
      <Collapse in={!summaryIsLong || expandSummary} collapsedSize={SUMMARY_COLLAPSED_HEIGHT} timeout={theme.motion.durations.medium}>
        <Typography
          sx={{
            fontSize: 14,
            lineHeight: 1.6,
            letterSpacing: '0.25px',
            color: theme.m3.onSurface,
            whiteSpace: 'pre-line',
          }}
        >
          {summary}
        </Typography>
      </Collapse>
      {summaryIsLong ? (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            onClick={() => setExpandSummary((value) => !value)}
            sx={{ minHeight: 32, px: '12px', fontSize: 14, fontWeight: 500, color: theme.m3.primary }}
          >
            {expandSummary ? '加载更少' : '加载更多'}
          </Button>
        </Box>
      ) : null}

      {/* 标签（原版 ActionChip：名称 + primary 色的使用数） */}
      <Typography sx={{ fontSize: 18, lineHeight: '28px', color: theme.m3.onSurface, mt: '16px', mb: '8px' }}>
        标签
      </Typography>
      {tags.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>暂无标签</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {visibleTags.map((tag, index) => (
            <Chip
              key={`${tag.name}-${index}`}
              variant="outlined"
              onClick={() => navigate(`/search?q=${encodeURIComponent(tag.name)}`)}
              label={
                <Box component="span" sx={{ fontSize: 13 }}>
                  {tag.name}{' '}
                  <Box component="span" sx={{ color: theme.m3.primary }}>
                    {tag.count}
                  </Box>
                </Box>
              }
              sx={{
                height: 32,
                borderRadius: '8px',
                '&:hover': { backgroundColor: theme.palette.action.hover },
              }}
            />
          ))}
          {showMoreTags ? (
            <Chip
              variant="outlined"
              onClick={() => setExpandTags(true)}
              label="更多 +"
              sx={{
                height: 32,
                borderRadius: '8px',
                color: theme.m3.primary,
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                  backgroundImage: stateLayer(theme.m3.primary),
                },
              }}
            />
          ) : null}
        </Box>
      )}

      {/* 播放来源与分集（Web 版把原版 SourceSheet 的内容放在概览内） */}
      <Box sx={{ mt: '24px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '12px' }}>
          <Typography sx={{ fontSize: 18, lineHeight: '28px', color: theme.m3.onSurface }}>
            播放来源
          </Typography>
          <Tooltip title="重新搜索源">
            <IconButton size="small" onClick={refreshSources} aria-label="重新搜索源">
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
        </Box>

        {searching ? <LinearProgress sx={{ mb: '12px' }} /> : null}

        {searchItems.length === 0 && !searching ? (
          <Typography sx={{ fontSize: 14, lineHeight: '20px', color: theme.m3.onSurfaceVariant }}>
            当前规则源未匹配到分集，可点击右下角「开始观看」进行嗅探。
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px', mb: '12px' }}>
              {searchItems.map((item) => {
                const selected = selectedSource?.src === item.src;
                return (
                  <Chip
                    key={item.src}
                    variant={selected ? 'filled' : 'outlined'}
                    onClick={() => void loadChapters(item)}
                    label={`[${item.pluginName}] ${item.name}`}
                    sx={{
                      height: 32,
                      borderRadius: '8px',
                      bgcolor: selected ? theme.m3.secondaryContainer : 'transparent',
                      color: selected ? theme.m3.onSecondaryContainer : theme.m3.onSurface,
                      '&:hover': {
                        backgroundColor: selected ? theme.m3.secondaryContainer : undefined,
                        backgroundImage: stateLayer(
                          selected ? theme.m3.onSecondaryContainer : theme.m3.onSurface,
                        ),
                      },
                    }}
                  />
                );
              })}
            </Box>

            {loadingRoads ? <LinearProgress sx={{ mb: '12px' }} /> : null}

            {episodes.length > 0 ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                  gap: '8px',
                }}
              >
                {episodes.map((episode, index) => (
                  <Chip
                    key={`${episode.name}-${index}`}
                    variant="outlined"
                    onClick={() => handlePlayEpisode(activeRoadIndex, index)}
                    label={episode.name}
                    sx={{
                      height: 32,
                      borderRadius: '8px',
                      maxWidth: '100%',
                      '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      '&:hover': {
                        backgroundColor: theme.m3.primaryContainer,
                        backgroundImage: 'none',
                      },
                    }}
                  />
                ))}
              </Box>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  );

  return (
    <Box ref={rootRef} sx={{ width: '100%', pb: '96px' }}>
      {/* 顶栏 + TabBar（原版 SliverAppBar.medium + bottom: TabBar）
          标题行未滚动时透明，让头图的模糊海报透出来；TabBar 始终是页面底色（原版背景止于 TabBar 上方） */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <Box
          sx={{
            bgcolor: scrolled ? theme.m3.surface : 'transparent',
            transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
          }}
        >
        <Box
          sx={{
            maxWidth: 1100,
            mx: 'auto',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            px: '4px',
          }}
        >
          <IconButton onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={24} />
          </IconButton>
          <Typography
            component="h1"
            sx={{
              flex: 1,
              minWidth: 0,
              mx: '8px',
              fontSize: 16,
              lineHeight: '24px',
              letterSpacing: '0.15px',
              fontWeight: 500,
              color: theme.m3.onSurface,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              // 原版 SliverAppBar：滚动后标题才出现
              opacity: scrolled ? 1 : 0,
              transition: `opacity ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
            }}
          >
            {title}
          </Typography>
          <IconButton aria-label="更多">
            <MoreHorizontal size={24} />
          </IconButton>
        </Box>
        </Box>

        {/* 原版 TabBar：isScrollable + tabAlignment center + dividerHeight 0 */}
        <Box sx={{ bgcolor: theme.m3.surface }}>
        <Tabs
          value={activeTab}
          onChange={(_, value: number) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons={false}
          allowScrollButtonsMobile
          sx={{
            minHeight: 48,
            '& .MuiTabs-list': { justifyContent: 'center' },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: '3px 3px 0 0',
              backgroundColor: theme.m3.primary,
              transition: `transform ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, left ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, width ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, background-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
            },
            '& .MuiTab-root': {
              minHeight: 48,
              px: '16px',
              fontSize: 14,
              fontWeight: 500,
              color: theme.m3.onSurfaceVariant,
              '&.Mui-selected': { color: theme.m3.primary },
            },
          }}
        >
          {INFO_TABS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
        </Box>
      </Box>

      {/* 头图卡片（含 Hero 共享元素 / 模糊背景 / 评分透视） */}
      <KzInfoHeroCard
        id={subjectId}
        subject={subject}
        loading={loading && !subject}
        placeholderCover={hint.cover}
        placeholderTitle={hint.title}
        collectStatus={collectStatus}
        onCollect={(status) => void handleCollect(status)}
      />

      {/* Tab 面板：150ms 淡入（原版 InfoTabView） */}
      <Fade in appear key={activeTab} timeout={theme.motion.durations.fast}>
        <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', px: '12px', pt: '16px' }}>
          {activeTab === 0 ? (
            overview
          ) : activeTab === 1 ? (
            <EmptyPane
              icon={<MessagesSquare size={40} />}
              title="暂无吐槽"
              hint="Web 版暂未接入吐槽接口，可在原版客户端查看。"
            />
          ) : activeTab === 2 ? (
            <KzInfoCharacterList subjectId={subjectId} />
          ) : activeTab === 3 ? (
            <EmptyPane
              icon={<Waypoints size={40} />}
              title="暂无关联条目"
              hint="Web 版暂未接入关联条目接口。"
            />
          ) : (
            <EmptyPane
              icon={<Users size={40} />}
              title="暂无制作人员信息"
              hint="Web 版暂未接入制作人员接口。"
            />
          )}
        </Box>
      </Fade>

      {/* 原版 FloatingActionButton.extended（primaryContainer / 圆角 16 / 无投影） */}
      <Fab
        variant="extended"
        aria-label="开始观看"
        onClick={() => handlePlayEpisode(0, 0)}
        sx={{
          position: 'fixed',
          right: { xs: 16, sm: 24 },
          bottom: { xs: 16, sm: 24 },
          zIndex: 30,
          px: '20px',
          gap: '8px',
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        <Play size={20} fill="currentColor" />
        开始观看
      </Fab>
    </Box>
  );
};

export default InfoPage;
