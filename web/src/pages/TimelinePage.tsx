import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  LinearProgress,
  Menu,
  MenuItem,
  Popover,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { CalendarOff, ChevronDown, SlidersHorizontal } from 'lucide-react';

import { apiService } from '../api/client';
import { cached, peek } from '../data/requestCache';
import { usePageScroll } from '../components/Layout/PageScrollContext';
import { animateScrollTo } from '../utils/scroll';
import { KzTimelineCard } from '../components/KzTimelineCard';
import { KzTimelineWeekSelector } from '../components/KzTimelineWeekSelector';
import type { BangumiSubject, CalendarDay } from '../types';

/**
 * 时间表，对齐原版 `Kazumi/lib/pages/timeline/timeline_page.dart`：
 *  - 顶栏 72（时间表 headlineSmall；窄屏竖屏时改为季度选择器 + expand_more）
 *  - 季度选择（secondaryContainer CircleAvatar 36）与「x — y 月 · 每周放送」副标题
 *  - 星期选择器 pinned（NestedScrollView 的 SliverPersistentHeader）
 *  - 卡片网格：列数 = floor((contentWidth + 12) / (minCardWidth + 12))，clamp(1,3)，间距 12
 *  - 排序：热度优先 / 评分优先 / 默认顺序（原版 _TimelineOptionsSheet 的 TimelineSort）
 *  - 数据缓存 + peek 首屏直出（原版 controller 跨页面存活），仅首次加载用骨架
 */

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const CALENDAR_KEY = 'timeline:calendar';
const SEASON_MONTHS = [1, 4, 7, 10];
const SEASON_TITLES: Record<number, string> = { 1: '冬季', 4: '春季', 7: '夏季', 10: '秋季' };
/** 原版 List.generate(20, (i) => now.year - i) */
const SEASON_YEARS = 20;
/** StyleString.safeSpace */
const SAFE_SPACE = '12px';
const CONTENT_MAX_WIDTH = 1280;
const HEADER_HEIGHT = 72;

type SortId = 'popularity' | 'rating' | 'defaultOrder';

const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'popularity', label: '热度优先' },
  { id: 'rating', label: '评分优先' },
  { id: 'defaultOrder', label: '默认顺序' },
];

type CalendarSubject = BangumiSubject & { air_date?: string; air_weekday?: number };

/** M3 状态层：hover/focus 时叠加 8% 前景色（原版 InkWell 的叠加层） */
const stateLayer = (color: string, opacity = 0.08) =>
  `linear-gradient(${alpha(color, opacity)}, ${alpha(color, opacity)})`;

function todayWeekdayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

function seasonStartMonth(date: Date): number {
  return Math.floor(date.getMonth() / 3) * 3 + 1;
}

function seasonLabel(date: Date): string {
  return `${date.getFullYear()}年${SEASON_TITLES[seasonStartMonth(date)]}季`;
}

function isSameSeason(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && seasonStartMonth(a) === seasonStartMonth(b);
}

function toCalendarSubject(raw: any): CalendarSubject | null {
  const sub = raw?.subject ?? raw;
  if (!sub || sub.id === undefined || sub.id === null) return null;
  return {
    id: Number(sub.id),
    name: sub.name ?? '',
    name_cn: sub.name_cn ?? sub.nameCN ?? sub.name ?? '',
    summary: sub.summary ?? sub.info ?? '',
    date: sub.date ?? sub.air_date,
    images: sub.images,
    rating: sub.rating,
    eps: sub.eps ?? sub.total_episodes,
    air_date: sub.air_date,
    air_weekday: Number(sub.air_weekday ?? sub.airWeekday) || undefined,
  };
}

/** 把 api.bgm.tv/calendar 的响应（以及兜底数据）规整成固定 7 天 */
function normalizeCalendar(data: unknown): CalendarDay[] {
  const days: CalendarDay[] = WEEKDAYS.map((label, index) => ({
    weekday: { en: '', cn: label, ja: '', id: index + 1 },
    items: [],
  }));
  const list = Array.isArray(data) ? data : [];
  const fallbackIndex = todayWeekdayIndex();

  list.forEach((entry: any) => {
    const items = Array.isArray(entry?.items) ? entry.items : entry?.subject ? [entry] : [];
    const entryWeekday = Number(
      entry?.weekday?.id ?? entry?.subject?.air_weekday ?? entry?.air_weekday,
    );
    items.forEach((raw: any) => {
      const subject = toCalendarSubject(raw);
      if (!subject) return;
      const weekday =
        subject.air_weekday ?? (entryWeekday >= 1 && entryWeekday <= 7 ? entryWeekday : undefined);
      const index = weekday && weekday >= 1 && weekday <= 7 ? weekday - 1 : fallbackIndex;
      days[index].items.push(subject);
    });
  });

  return days;
}

/** 原版 BangumiTimelineCard._supportingText：集数 + 标签，无则回退原名 */
function metaFor(item: CalendarSubject): string {
  const parts: string[] = [];
  if (item.eps) parts.push(`${item.eps} 话`);
  const year = (item.air_date ?? item.date ?? '').slice(0, 4);
  if (year) parts.push(year);
  if (parts.length > 0) return parts.join(' · ');

  const original = (item.name ?? '').trim();
  const title = (item.name_cn || item.name || '').trim();
  return original && original !== title ? original : '';
}

export const TimelinePage: React.FC = () => {
  const theme = useTheme();
  const scrollRef = usePageScroll();
  /** 原版 narrowPortrait：宽 < 600 且高 > 宽 → 季度选择器移入 AppBar */
  const narrowPortrait = useMediaQuery('(max-width: 599.95px) and (orientation: portrait)');
  /** 原版 _TimelineOptionsButton 的 compact：可用宽度 < 16 * 22 */
  const compactOptions = useMediaQuery('(max-width: 351.95px)');

  const [calendar, setCalendar] = useState<CalendarDay[] | null>(
    () => peek<CalendarDay[]>(CALENDAR_KEY) ?? null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortId>('popularity');
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);
  const [seasonAnchor, setSeasonAnchor] = useState<null | HTMLElement>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [activeDay, setActiveDay] = useState(() => todayWeekdayIndex());

  const todayIndex = todayWeekdayIndex();
  const loading = calendar === null;
  const currentSeason = isSameSeason(selectedDate, new Date());
  const sortLabel = SORTS.find((option) => option.id === sort)?.label ?? '热度优先';

  const loadData = useCallback(async () => {
    // 命中缓存时不再显示骨架，只在后台刷新（切页不闪烁）
    if (peek<CalendarDay[]>(CALENDAR_KEY) === undefined) setRefreshing(true);
    try {
      const data = await cached(CALENDAR_KEY, () =>
        apiService.getCalendar().then(normalizeCalendar),
      );
      setCalendar(data);
    } catch (err) {
      console.error('加载时间表失败:', err);
      setCalendar((prev) => prev ?? normalizeCalendar([]));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(
    () => (calendar ? calendar.map((day) => day.items.length) : WEEKDAYS.map(() => 0)),
    [calendar],
  );

  const labels = useMemo(
    () => WEEKDAYS.map((label, index) => (currentSeason && index === todayIndex ? '今天' : label)),
    [currentSeason, todayIndex],
  );

  const items = useMemo(() => {
    const list = [...(calendar?.[activeDay]?.items ?? [])];
    if (sort === 'popularity') {
      // Web 版后端不提供热度字段，用评分人数近似「热度」
      list.sort(
        (a, b) =>
          (b.rating?.total ?? 0) - (a.rating?.total ?? 0) ||
          (b.rating?.score ?? 0) - (a.rating?.score ?? 0),
      );
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0));
    }
    return list;
  }, [calendar, activeDay, sort]);

  const selectDay = (index: number) => {
    if (index === activeDay) return;
    setActiveDay(index);
    // 原版每个 TabBarView 页各自保留滚动位置；Web 单滚动容器下切换星期回到顶部（350ms easeOut）
    animateScrollTo(scrollRef?.current ?? null, 0, theme.motion.durations.scroll);
  };

  const openSeasonPicker = (event: React.MouseEvent<HTMLElement>) => {
    if (loading) return;
    setSeasonAnchor(event.currentTarget);
  };

  const selectSeason = (date: Date) => {
    setSeasonAnchor(null);
    if (isSameSeason(date, selectedDate)) return;
    // Web 版后端 /bangumi/calendar 只返回当季时间表（无 season 参数），
    // 因此切换季度只更新标题与「今天」判定，列表仍是当季数据。
    setSelectedDate(date);
  };

  const seasonStart = seasonStartMonth(selectedDate);
  const now = new Date();

  const seasonPicker = (inAppBar: boolean) => (
    <ButtonBase
      onClick={openSeasonPicker}
      disabled={loading}
      aria-label={`切换放送季度，${seasonLabel(selectedDate)}`}
      sx={{
        borderRadius: '20px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: inAppBar ? '4px' : '12px',
        py: '8px',
        px: inAppBar ? '4px' : '8px',
        maxWidth: '100%',
        color: theme.m3.onSurface,
        '&:hover': { backgroundColor: theme.palette.action.hover },
        '&.Mui-disabled': { opacity: 0.6 },
      }}
    >
      <Typography
        sx={{
          fontSize: inAppBar ? 16 : { xs: 22, sm: 28 },
          lineHeight: inAppBar ? '24px' : 1.3,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {seasonLabel(selectedDate)}
      </Typography>

      {inAppBar ? (
        <ChevronDown size={20} />
      ) : (
        <Box
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: theme.m3.secondaryContainer,
            color: theme.m3.onSecondaryContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronDown size={24} />
        </Box>
      )}
    </ButtonBase>
  );

  return (
    <Box sx={{ width: '100%', minHeight: '100%' }}>
      {/* 顶栏（原版 SysAppBar toolbarHeight 72，pinned） */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          height: HEADER_HEIGHT,
          bgcolor: theme.m3.surface,
        }}
      >
        <Box
          sx={{
            height: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            mx: 'auto',
            px: SAFE_SPACE,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {narrowPortrait ? (
            <Box sx={{ minWidth: 0, flex: 1 }}>{seasonPicker(true)}</Box>
          ) : (
            <Typography
              component="h1"
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: 24,
                lineHeight: '32px',
                fontWeight: 500,
                color: theme.m3.onSurface,
              }}
            >
              时间表
            </Typography>
          )}

          <Tooltip title={`排序与筛选：${sortLabel}，未启用筛选`}>
            <Button
              onClick={(event) => setSortAnchor(event.currentTarget)}
              aria-label={`排序与筛选：${sortLabel}`}
              sx={{
                flexShrink: 0,
                minWidth: 48,
                height: 48,
                px: '16px',
                py: '12px',
                bgcolor: theme.m3.secondaryContainer,
                color: theme.m3.onSecondaryContainer,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: '20px',
                letterSpacing: '0.1px',
                '&:hover': {
                  bgcolor: theme.m3.secondaryContainer,
                  backgroundImage: stateLayer(theme.m3.onSecondaryContainer),
                },
              }}
            >
              {compactOptions ? <SlidersHorizontal size={20} /> : sortLabel}
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* 排序菜单：原版 _TimelineOptionsSheet 的排序 Chip 组 */}
      <Menu
        anchorEl={sortAnchor}
        open={Boolean(sortAnchor)}
        onClose={() => setSortAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {SORTS.map((option) => (
          <MenuItem
            key={option.id}
            selected={option.id === sort}
            onClick={() => {
              setSort(option.id);
              setSortAnchor(null);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      {/* 季度选择：原版 _showSeasonBottomSheet（ContentSection + 1/4/7/10 月按钮） */}
      <Popover
        open={Boolean(seasonAnchor)}
        anchorEl={seasonAnchor}
        onClose={() => setSeasonAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: { width: 320, maxHeight: 420, overflowY: 'auto', borderRadius: '12px' },
          },
        }}
      >
        <Box sx={{ p: '8px' }}>
          {Array.from({ length: SEASON_YEARS }, (_, index) => now.getFullYear() - index).map(
            (year) => (
              <Box key={year} sx={{ mb: '8px' }}>
                <Typography
                  sx={{
                    px: '8px',
                    py: '4px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: theme.m3.onSurfaceVariant,
                  }}
                >
                  {year}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                  {SEASON_MONTHS.map((month) => {
                    const date = new Date(year, month - 1, 1);
                    const disabled = date.getTime() > now.getTime();
                    const selected = isSameSeason(selectedDate, date);
                    return (
                      <ButtonBase
                        key={month}
                        disabled={disabled}
                        onClick={() => selectSeason(date)}
                        sx={{
                          height: 48,
                          borderRadius: '9999px',
                          px: '8px',
                          py: '12px',
                          fontSize: 14,
                          fontWeight: 500,
                          bgcolor: selected ? theme.m3.secondaryContainer : 'transparent',
                          color: selected
                            ? theme.m3.onSecondaryContainer
                            : disabled
                              ? theme.palette.text.disabled
                              : theme.m3.onSurface,
                          '&:hover': {
                            backgroundColor: selected
                              ? theme.m3.secondaryContainer
                              : theme.palette.action.hover,
                          },
                        }}
                      >
                        {SEASON_TITLES[month]}季
                      </ButtonBase>
                    );
                  })}
                </Box>
              </Box>
            ),
          )}
        </Box>
      </Popover>

      {/* 季度标题（原版 _buildSeasonHeader，窄屏竖屏时不显示） */}
      {!narrowPortrait && (
        <Box
          sx={{
            maxWidth: CONTENT_MAX_WIDTH,
            mx: 'auto',
            px: SAFE_SPACE,
            pt: '8px',
            pb: '20px',
          }}
        >
          {seasonPicker(false)}
          <Typography
            sx={{
              fontSize: 14,
              lineHeight: '20px',
              letterSpacing: '0.25px',
              color: theme.m3.onSurfaceVariant,
            }}
          >
            {loading ? '正在加载放送时间表…' : `${seasonStart} — ${seasonStart + 2} 月 · 每周放送`}
          </Typography>
        </Box>
      )}

      {/* 星期选择器（原版 pinned SliverPersistentHeader，背景为页面底色以遮住滚动内容） */}
      <Box
        sx={{
          position: 'sticky',
          top: HEADER_HEIGHT,
          zIndex: 19,
          bgcolor: theme.m3.surface,
          pb: '16px',
        }}
      >
        <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', px: SAFE_SPACE }}>
          <KzTimelineWeekSelector
            labels={labels}
            counts={counts}
            value={activeDay}
            onChange={selectDay}
            loading={loading}
          />
        </Box>
      </Box>

      {/* 当日放送列表 */}
      <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', px: SAFE_SPACE, pb: 6 }}>
        {loading ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
              gap: '12px',
            }}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={160} sx={{ borderRadius: '12px' }} />
            ))}
          </Box>
        ) : (
          <>
            {/* 原版在列表顶部显示 4px LinearProgressIndicator */}
            {refreshing && <LinearProgress sx={{ mb: '12px' }} />}

            {items.length === 0 ? (
              <Box
                sx={{
                  py: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  color: theme.m3.onSurfaceVariant,
                }}
              >
                <CalendarOff size={40} />
                <Typography sx={{ fontSize: 16, color: theme.m3.onSurface }}>
                  这一天暂无放送
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
                  gap: '12px',
                }}
              >
                {items.map((item) => (
                  <KzTimelineCard
                    key={item.id}
                    id={item.id}
                    title={(item.name_cn || item.name || '').trim()}
                    coverUrl={item.images?.large || item.images?.common || item.images?.medium}
                    meta={metaFor(item)}
                    score={item.rating?.score}
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default TimelinePage;
