import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, Fab, IconButton, Menu, MenuItem, Tooltip, Typography, useTheme } from '@mui/material';
import { ArrowUp, ChevronDown, History as HistoryIcon, Search as SearchIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { BangumiCard } from '../components/Cards/BangumiCard';
import { usePageScroll } from '../components/Layout/PageScrollContext';
import { apiService } from '../api/client';
import { cached, peek } from '../data/requestCache';
import { animateScrollTo } from '../utils/scroll';
import type { BangumiSubject } from '../types';

/** 顶栏分类（交互与样式对齐原版 SliverAppBar 的折叠标题 + 下拉菜单） */
const CATEGORIES = [
  { id: 'popular', label: '热门番组' },
  { id: 'today', label: '今日放送' },
  { id: 'new', label: '本季新番' },
  { id: 'rank', label: '经典高分' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const CALENDAR_KEY = 'bangumi:calendar';

/** 原版 SliverAppBar：展开 120、收起 56，字号 28→20，字重 w700→w500 */
const HEADER_EXPANDED = 120;
const HEADER_COLLAPSED = 56;
const COLLAPSE_DISTANCE = HEADER_EXPANDED - HEADER_COLLAPSED;
const TITLE_FONT_MAX = 28;
const TITLE_FONT_MIN = 20;

type CalendarItem = BangumiSubject & { air_weekday?: number };

export const PopularPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const scrollRef = usePageScroll();

  // 命中缓存直接渲染（原版 controller 里的 trendList 跨页面存活，切回不闪骨架）
  const [subjects, setSubjects] = useState<CalendarItem[]>(() => peek<CalendarItem[]>(CALENDAR_KEY) ?? []);
  const [loading, setLoading] = useState(() => peek<CalendarItem[]>(CALENDAR_KEY) === undefined);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[0]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [collapseT, setCollapseT] = useState(0);
  const [isPortrait, setIsPortrait] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches,
  );

  /* ---------------- 顶栏折叠：滚动联动（对齐 SliverAppBar 的插值） ---------------- */
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = Math.min(1, Math.max(0, el.scrollTop / COLLAPSE_DISTANCE));
        setCollapseT(t);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => setIsPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /* ------------------------------- 数据加载 ------------------------------- */
  const loadData = useCallback(async () => {
    if (peek<CalendarItem[]>(CALENDAR_KEY) === undefined) setLoading(true);
    try {
      const data: any = await cached(CALENDAR_KEY, () => apiService.getCalendar());
      const all: CalendarItem[] = [];
      if (Array.isArray(data)) {
        data.forEach((entry: any) => {
          if (entry?.items && Array.isArray(entry.items)) {
            const weekday = entry?.weekday?.id;
            entry.items.forEach((item: any) => {
              all.push({ ...item, air_weekday: item?.air_weekday ?? weekday });
            });
          } else if (entry?.subject) {
            all.push({
              id: entry.subject.id,
              name: entry.subject.name,
              name_cn: entry.subject.nameCN || entry.subject.name_cn || entry.subject.name,
              summary: entry.subject.info || '',
              images: entry.subject.images,
              rating: entry.subject.rating,
              eps: entry.subject.eps,
            } as CalendarItem);
          } else if (entry?.id && entry?.name) {
            all.push(entry);
          }
        });
      }
      setSubjects(all);
    } catch (err) {
      console.error('加载热门推荐失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* --------------------- 分类：仅本地派生，不重新请求（连续性） --------------------- */
  const visibleSubjects = useMemo(() => {
    const list = [...subjects];
    const todayWeekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
    switch (category.id as CategoryId) {
      case 'today':
        return list
          .filter((item) => item.air_weekday === todayWeekday)
          .sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0));
      case 'new':
        return list.sort((a, b) => (b.id || 0) - (a.id || 0));
      case 'rank':
      case 'popular':
      default:
        return list.sort((a, b) => (b.rating?.score || 0) - (a.rating?.score || 0));
    }
  }, [subjects, category.id]);

  /* ------------------------------- 网格列数 -------------------------------
     原版 popular_page.dart:126-147 —— ≤600 三列、>600 五列、>840 六列 */
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const columns = viewportWidth > 840 ? 6 : viewportWidth > 600 ? 5 : 3;

  const scrollToTop = () => animateScrollTo(scrollRef?.current ?? null, 0, theme.motion.durations.scroll);

  const selectCategory = (next: (typeof CATEGORIES)[number]) => {
    setMenuAnchor(null);
    if (next.id === category.id) return;
    animateScrollTo(scrollRef?.current ?? null, 0, theme.motion.durations.medium);
    setCategory(next);
  };

  const titleSize = TITLE_FONT_MAX - (TITLE_FONT_MAX - TITLE_FONT_MIN) * collapseT;
  const titleWeight = collapseT < 0.5 ? 700 : 500;

  return (
    <Box sx={{ position: 'relative', minHeight: '100%' }}>
      {/* 顶栏：pinned + 折叠（原版 SliverAppBar，expandedHeight 120） */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          height: HEADER_EXPANDED - COLLAPSE_DISTANCE * collapseT,
          display: 'flex',
          alignItems: 'flex-end',
          pl: 2,
          pr: 1,
          pb: 1,
          bgcolor: theme.m3.surface,
        }}
      >
        <ButtonBase
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            height: 44,
            borderRadius: '8px',
            px: 0.5,
          }}
        >
          <Typography
            component="h1"
            sx={{
              fontSize: titleSize,
              fontWeight: titleWeight,
              lineHeight: 1.2,
              color: theme.m3.onSurface,
            }}
          >
            {category.label}
          </Typography>
          <ChevronDown size={titleSize} strokeWidth={2} style={{ opacity: 0.8 }} />
        </ButtonBase>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {isPortrait && (
            <Tooltip title="搜索">
              <IconButton onClick={() => navigate('/search')} aria-label="搜索">
                <SearchIcon size={22} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="历史记录">
            <IconButton onClick={() => navigate('/history')} aria-label="历史记录">
              <HistoryIcon size={22} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        slotProps={{
          paper: {
            sx: {
              // 原版 MenuStyle maximumSize: Size(240, 350)
              maxWidth: 240,
              maxHeight: 350,
              minWidth: 180,
            },
          },
        }}
      >
        {CATEGORIES.map((c) => (
          <MenuItem
            key={c.id}
            selected={c.id === category.id}
            onClick={() => selectCategory(c)}
          >
            {c.label}
          </MenuItem>
        ))}
      </Menu>

      {/* 网格：原版 SliverPadding(8) + 行间距 cardSpace-2=6 / 列间距 cardSpace=8 */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          columnGap: '8px',
          rowGap: '6px',
          p: '8px',
        }}
      >
        {loading && subjects.length === 0
          ? // 原版加载期渲染 10 个空位（非 shimmer）
            Array.from({ length: 10 }).map((_, i) => (
              <Box
                key={`ph-${i}`}
                sx={{
                  width: '100%',
                  pt: '153.85%',
                  borderRadius: '12px',
                  bgcolor: theme.m3.surfaceContainerHighest,
                }}
              />
            ))
          : visibleSubjects.map((sub) => (
              <BangumiCard
                key={sub.id}
                id={sub.id}
                title={sub.name_cn || sub.name}
                coverUrl={sub.images?.large || sub.images?.common || sub.images?.medium}
              />
            ))}
      </Box>

      {/* 回到顶部 FAB：原版常驻（非滚动后才出现），M3 FAB 形状 */}
      <Fab
        size="medium"
        aria-label="回到顶部"
        onClick={scrollToTop}
        sx={{
          position: 'fixed',
          right: { xs: 16, sm: 24 },
          bottom: isPortrait ? 96 : 24,
          zIndex: 30,
        }}
      >
        <ArrowUp size={22} strokeWidth={2.4} />
      </Fab>
    </Box>
  );
};

export default PopularPage;
