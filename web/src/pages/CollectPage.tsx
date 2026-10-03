import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Menu,
  MenuItem,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../api/client';
import { cached, peek } from '../data/requestCache';
import {
  KZ_COLLECT_SORTS,
  KZ_PAGE_PAD,
  KZ_STATUS_TABS,
  KzCategoryStrip,
  KzCollectListTile,
  KzCollectPosterCard,
  KzLayoutSwitch,
  KzSearchBar,
  type KzCollectLayout,
  type KzCollectSort,
} from '../components/KzCollect/KzCollectParts';
import type { CollectRecord } from '../types';

/**
 * 追番页 —— 对照原版：
 *  - Kazumi/lib/pages/collect/collect_page.dart（AppBar 标题「追番」+ 同步按钮）
 *  - Kazumi/lib/pages/collect/collect_library_view.dart（分类 / 搜索 / 排序 / 布局 / 空态）
 *  - Kazumi/lib/pages/collect/collect_library_controls.dart（胶囊分类、布局切换、排序菜单）
 *  - Kazumi/lib/pages/collect/collect_library_card.dart（列表项与海报卡）
 *
 * 连续性：数据走 requestCache，`peek` 命中缓存直接渲染，切页不闪骨架（UI-SPEC §8）。
 */

const COLLECT_KEY = 'collect:list';
const EXIT_MS = 150;

type CollectWithMeta = CollectRecord & { updatedAt?: string };

const timeOf = (item: CollectWithMeta): number => {
  const t = item.updatedAt ? Date.parse(item.updatedAt) : 0;
  return Number.isFinite(t) ? t : 0;
};

export const CollectPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width:600px)');

  // 命中缓存直接渲染（对齐原版 controller 里常驻的 collectibles）
  const [collects, setCollects] = useState<CollectWithMeta[]>(
    () => peek<CollectWithMeta[]>(COLLECT_KEY) ?? [],
  );
  const [loading, setLoading] = useState(() => peek<CollectWithMeta[]>(COLLECT_KEY) === undefined);
  const [syncing, setSyncing] = useState(false);
  const [activeStatus, setActiveStatus] = useState(2); // 原版默认「在看」
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<KzCollectSort>('recentlyChanged');
  const [layout, setLayout] = useState<KzCollectLayout>('list'); // 原版默认列表视图
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const [exiting, setExiting] = useState<number[]>([]);

  const exitTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      exitTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  /* ------------------------------ 数据加载 ------------------------------ */
  const loadData = useCallback(async (force = false) => {
    if (peek<CollectWithMeta[]>(COLLECT_KEY) === undefined) setLoading(true);
    try {
      const data = force
        ? await apiService.getCollects()
        : await cached(COLLECT_KEY, () => apiService.getCollects());
      setCollects((data as CollectWithMeta[]) ?? []);
    } catch (err) {
      console.error('加载追番列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    await loadData(true);
    setSyncing(false);
  };

  /** 删除：先播放淡出，再落库（避免生硬跳变，UI-SPEC 动效要求 10） */
  const removeItem = (item: CollectWithMeta) => {
    setExiting((prev) => (prev.includes(item.bangumiId) ? prev : [...prev, item.bangumiId]));
    const timer = window.setTimeout(async () => {
      try {
        await apiService.deleteCollect(item.bangumiId);
      } catch (err) {
        console.error('移除追番失败:', err);
      }
      setCollects((prev) => prev.filter((row) => row.bangumiId !== item.bangumiId));
      setExiting((prev) => prev.filter((id) => id !== item.bangumiId));
      void loadData(true);
    }, EXIT_MS);
    exitTimers.current.push(timer);
  };

  const changeStatus = async (item: CollectWithMeta, status: number) => {
    if (status === 0) {
      removeItem(item);
      return;
    }
    // 乐观更新，随后与后端对齐；revision 变化会重放淡入
    setCollects((prev) =>
      prev.map((row) => (row.bangumiId === item.bangumiId ? { ...row, status } : row)),
    );
    try {
      await apiService.saveCollect({ ...item, status });
    } catch (err) {
      console.error('修改追番状态失败:', err);
    }
    void loadData(true);
  };

  /* --------------------------- 过滤 + 排序（本地） --------------------------- */
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = collects.filter((item) => {
      const matchStatus = activeStatus === 0 || (item.status ?? 2) === activeStatus;
      const matchQuery = !keyword || item.bangumiName.toLowerCase().includes(keyword);
      return matchStatus && matchQuery;
    });
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'title':
          return a.bangumiName.localeCompare(b.bangumiName, 'zh-Hans-CN');
        case 'airDate':
          return (a.bangumiId ?? 0) - (b.bangumiId ?? 0);
        case 'rating':
        case 'recentlyChanged':
        default:
          return timeOf(b) - timeOf(a) || (a.bangumiId ?? 0) - (b.bangumiId ?? 0);
      }
    });
    return sorted;
  }, [collects, activeStatus, query, sort]);

  const counts = useMemo(() => {
    const result: Record<number, number> = {};
    KZ_STATUS_TABS.forEach((tab) => {
      result[tab.id] = collects.filter((item) => tab.id === 0 || (item.status ?? 2) === tab.id).length;
    });
    return result;
  }, [collects]);

  const open = (item: CollectWithMeta) => navigate(`/info/${item.bangumiId}`);

  /* 列表内容变化（切换分类/搜索/删除/状态改变）时重排淡入，
     复刻原版 TabBarView / 列表重建时的过渡，避免生硬跳变 */
  const listSignature = filtered.map((item) => item.bangumiId).join(',');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setRevision((prev) => prev + 1);
  }, [listSignature]);

  const searching = query.trim().length > 0;
  const emptyState = searchQueryEmpty(searching, counts, activeStatus);

  /* --------------------------------- 渲染 --------------------------------- */
  return (
    <Box sx={{ width: '100%', pb: 6 }}>
      {/* 顶栏：标题 + 同步（原版 SysAppBar title「追番」+ StateActionButton.tonal） */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          height: 72,
          px: `${KZ_PAGE_PAD}px`,
          bgcolor: theme.m3.surface,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography
          sx={{
            fontSize: { xs: 20, sm: 24 },
            fontWeight: 500,
            lineHeight: '32px',
            color: theme.m3.onSurface,
          }}
        >
          追番
        </Typography>

        <Tooltip title="同步收藏">
          <span>
            <Button
              onClick={sync}
              disabled={syncing}
              startIcon={
                <RefreshCw
                  size={18}
                  style={syncing ? { animation: 'kzSpin 1s linear infinite' } : undefined}
                />
              }
              sx={{
                bgcolor: theme.m3.secondaryContainer,
                color: theme.m3.onSecondaryContainer,
                '&:hover': { bgcolor: theme.m3.secondaryContainer },
                '&.Mui-disabled': { bgcolor: theme.m3.surfaceContainerHighest },
                '@keyframes kzSpin': {
                  from: { transform: 'rotate(0deg)' },
                  to: { transform: 'rotate(360deg)' },
                },
              }}
            >
              同步
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ px: `${KZ_PAGE_PAD}px` }}>
        {/* 分类胶囊 + 部数统计（桌面显示在右上，与原版一致） */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <KzCategoryStrip active={activeStatus} onChange={setActiveStatus} />
          </Box>
          {wide && (
            <Typography
              sx={{ fontSize: 14, fontWeight: 500, color: theme.m3.onSurfaceVariant, flexShrink: 0 }}
            >
              {filtered.length} 部
            </Typography>
          )}
        </Box>

        <Box sx={{ height: 12 }} />

        {/* 工具栏：搜索 / 排序 / 布局切换 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {wide ? (
            <Box sx={{ flex: 1, minWidth: 0, maxWidth: 360 }}>
              <KzSearchBar value={query} onChange={setQuery} />
            </Box>
          ) : (
            <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 500, color: theme.m3.onSurfaceVariant }}>
              {filtered.length} 部
            </Typography>
          )}

          <ButtonBase
            onClick={(e) => setSortAnchor(e.currentTarget)}
            aria-label={`排序：${KZ_COLLECT_SORTS.find((s) => s.id === sort)?.label ?? ''}`}
            sx={{
              height: 48,
              px: wide ? '16px' : '12px',
              gap: '8px',
              borderRadius: '9999px',
              color: theme.m3.onSurfaceVariant,
              fontSize: 14,
              fontWeight: 500,
              transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
              '&:hover': { bgcolor: theme.m3.surfaceContainer },
            }}
          >
            <SlidersHorizontal size={20} />
            {wide && (KZ_COLLECT_SORTS.find((s) => s.id === sort)?.label ?? '排序')}
          </ButtonBase>

          {!wide && (
            <Tooltip title={searchExpanded ? '收起搜索' : '搜索收藏'}>
              <ButtonBase
                onClick={() => {
                  setSearchExpanded((prev) => {
                    if (prev) setQuery('');
                    return !prev;
                  });
                }}
                aria-label={searchExpanded ? '收起搜索' : '搜索收藏'}
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '9999px',
                  color: searchExpanded ? theme.m3.onSecondaryContainer : theme.m3.onSurfaceVariant,
                  bgcolor: searchExpanded ? theme.m3.secondaryContainer : 'transparent',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </ButtonBase>
            </Tooltip>
          )}

          <KzLayoutSwitch value={layout} onChange={setLayout} />
        </Box>

        {!wide && searchExpanded && (
          <Box sx={{ mt: '12px' }}>
            <KzSearchBar value={query} onChange={setQuery} placeholder="搜索收藏番剧" />
          </Box>
        )}

        <Box sx={{ height: 20 }} />

        {/* 结果区 */}
        {loading && collects.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={144} />
            ))}
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ py: 8, px: 2, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>{emptyState}</Typography>
          </Box>
        ) : layout === 'list' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map((item) => (
              <KzCollectListTile
                key={`${revision}-${item.bangumiId}`}
                item={item}
                onOpen={open}
                onChangeStatus={changeStatus}
                entering
                exiting={exiting.includes(item.bangumiId)}
              />
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${wide ? 5 : 3}, minmax(0, 1fr))`,
              columnGap: wide ? '12px' : '8px',
              rowGap: wide ? '12px' : '8px',
            }}
          >
            {filtered.map((item) => (
              <KzCollectPosterCard
                key={`${revision}-${item.bangumiId}`}
                item={item}
                showStatus={activeStatus === 0}
                onOpen={open}
                onChangeStatus={changeStatus}
                entering
                exiting={exiting.includes(item.bangumiId)}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* 排序菜单（原版 _CollectSortMenu） */}
      <Menu
        anchorEl={sortAnchor}
        open={Boolean(sortAnchor)}
        onClose={() => setSortAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {KZ_COLLECT_SORTS.map((option) => (
          <MenuItem
            key={option.id}
            selected={option.id === sort}
            onClick={() => {
              setSortAnchor(null);
              setSort(option.id);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

/** 空态文案对齐原版 _emptyState */
function searchQueryEmpty(searching: boolean, counts: Record<number, number>, active: number): string {
  if (searching) {
    return (counts[active] ?? 0) > 0 ? '当前分类没有匹配的番剧' : '没有找到匹配的番剧';
  }
  if ((counts[0] ?? 0) === 0) return '还没有收藏的番剧';
  switch (active) {
    case 2:
      return '还没有在追的番剧';
    case 1:
      return '还没有想看的番剧';
    case 3:
      return '还没有看过的番剧';
    case 4:
      return '没有搁置的番剧';
    case 5:
      return '没有弃追的番剧';
    default:
      return '还没有收藏的番剧';
  }
}

export default CollectPage;
