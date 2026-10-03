import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../api/client';
import { cached, peek } from '../data/requestCache';
import { useAppStore } from '../stores/useAppStore';
import {
  KZ_HISTORY_PAGE_PAD,
  KzHistoryFilters,
  KzHistoryGroupHeader,
  KzHistoryTile,
  kzGroupHistory,
  type KzHistorySource,
} from '../components/KzHistory/KzHistoryParts';
import type { HistoryRecord } from '../types';

/**
 * 观看历史页 —— 对照原版：
 *  - Kazumi/lib/pages/history/history_page.dart（AppBar：标题 + 管理 / 清空全部，PopScope 退出编辑）
 *  - Kazumi/lib/pages/history/history_list_view.dart（搜索、来源筛选、日期分组、空态）
 *  - Kazumi/lib/pages/history/history_record_tile.dart（条目卡片、Dismissible 删除）
 *
 * 连续性：`peek('history:list')` 命中缓存直接渲染；删除先淡出再落库。
 */

const HISTORY_KEY = 'history:list';
const EXIT_MS = 150;

export const HistoryPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const compact = !useMediaQuery('(min-width:600px)');
  const setPlayingContext = useAppStore((state) => state.setPlayingContext);

  const [histories, setHistories] = useState<HistoryRecord[]>(
    () => peek<HistoryRecord[]>(HISTORY_KEY) ?? [],
  );
  const [loading, setLoading] = useState(() => peek<HistoryRecord[]>(HISTORY_KEY) === undefined);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<KzHistorySource>('all');
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exiting, setExiting] = useState<number[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  /* ------------------------------ 数据加载 ------------------------------ */
  const loadData = useCallback(async () => {
    if (peek<HistoryRecord[]>(HISTORY_KEY) === undefined) setLoading(true);
    try {
      const data = await cached(HISTORY_KEY, () => apiService.getHistories());
      setHistories(data ?? []);
    } catch (err) {
      console.error('加载观看历史失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiService.getHistories();
      cached(HISTORY_KEY, () => Promise.resolve(data));
      setHistories(data ?? []);
    } catch (err) {
      console.error('刷新观看历史失败:', err);
    }
  }, []);

  /* --------------------------- 播放 / 删除 / 清空 --------------------------- */
  const resumePlay = (item: HistoryRecord) => {
    setPlayingContext(
      item.bangumiName,
      item.coverUrl || '',
      [
        {
          name: '历史线路',
          episodes: [{ name: item.episodeName, url: item.episodeUrl }],
          identifier: [item.episodeName],
          data: [item.episodeUrl],
        },
      ],
      0,
      0,
      null,
      null,
    );
    navigate('/play');
  };

  const removeHistory = (item: HistoryRecord) => {
    if (!item.id || clearing) return;
    const id = item.id;
    setExiting((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const timer = window.setTimeout(async () => {
      try {
        await apiService.deleteHistory(id);
      } catch (err) {
        console.error('删除历史记录失败:', err);
      }
      const next = histories.filter((row) => row.id !== id);
      setHistories(next);
      if (next.length === 0) setEditing(false);
      setExiting((prev) => prev.filter((row) => row !== id));
      void refresh();
    }, EXIT_MS);
    timers.current.push(timer);
  };

  const clearAll = async () => {
    setConfirmClear(false);
    setClearing(true);
    try {
      await apiService.clearHistories();
      setHistories([]);
      setEditing(false);
    } catch (err) {
      console.error('清空观看历史失败:', err);
    } finally {
      setClearing(false);
    }
  };

  const groups = useMemo(() => kzGroupHistory(histories, query, source), [histories, query, source]);
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  const filtered = query.trim().length > 0 || source !== 'all';

  return (
    <Box sx={{ width: '100%', pb: 6 }}>
      {/* 顶栏：标题 + 管理 / 清空（原版 SysAppBar，进入编辑态后可退出） */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          minHeight: 72,
          px: `${KZ_HISTORY_PAGE_PAD}px`,
          bgcolor: theme.m3.surface,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <IconButton
          onClick={() => (editing ? setEditing(false) : navigate(-1))}
          aria-label={editing ? '完成' : '返回'}
          sx={{ color: theme.m3.onSurface, ml: '-8px' }}
        >
          <ArrowLeft size={22} />
        </IconButton>

        <Typography
          sx={{
            flex: 1,
            fontSize: { xs: 20, sm: 24 },
            fontWeight: 500,
            lineHeight: '32px',
            color: theme.m3.onSurface,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          历史记录
        </Typography>

        {histories.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {editing ? (
              <Button
                onClick={() => setEditing(false)}
                disabled={clearing}
                sx={{
                  bgcolor: theme.m3.secondaryContainer,
                  color: theme.m3.onSecondaryContainer,
                  '&:hover': { bgcolor: theme.m3.secondaryContainer },
                }}
              >
                完成
              </Button>
            ) : (
              <Tooltip title="管理历史记录">
                <IconButton
                  onClick={() => setEditing(true)}
                  aria-label="管理历史记录"
                  sx={{
                    bgcolor: theme.m3.secondaryContainer,
                    color: theme.m3.onSecondaryContainer,
                    '&:hover': { bgcolor: theme.m3.secondaryContainer },
                  }}
                >
                  <Pencil size={20} />
                </IconButton>
              </Tooltip>
            )}
            {editing && (
              <Tooltip title="清空全部历史记录">
                <span>
                  <IconButton
                    onClick={() => setConfirmClear(true)}
                    disabled={clearing}
                    aria-label="清空全部历史记录"
                    sx={{ color: theme.m3.error }}
                  >
                    <Trash2 size={20} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>

      <Box sx={{ px: `${KZ_HISTORY_PAGE_PAD}px`, maxWidth: 960 + KZ_HISTORY_PAGE_PAD * 2, mx: 'auto' }}>
        {/* 搜索 + 来源筛选（原版 TextField + Wrap 的 FilterChip） */}
        {(histories.length > 0 || filtered) && (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: 56,
                px: '20px',
                borderRadius: '28px',
                bgcolor: theme.m3.surfaceContainerHigh,
                transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.m3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <Box
                component="input"
                value={query}
                placeholder="搜索番剧、别名或来源"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  bgcolor: 'transparent',
                  color: theme.m3.onSurface,
                  font: 'inherit',
                  fontSize: 14,
                  '&::placeholder': { color: theme.m3.onSurfaceVariant, opacity: 1 },
                }}
              />
              {query !== '' && (
                <IconButton size="small" aria-label="清除搜索" onClick={() => setQuery('')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </IconButton>
              )}
            </Box>

            <Box sx={{ height: 16 }} />
            <KzHistoryFilters value={source} onChange={setSource} />
            <Box sx={{ height: 20 }} />

            <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>
              {editing
                ? `共 ${count} 条记录 · 点按删除按钮移除`
                : filtered
                  ? `找到 ${count} 条记录 · 最近观看优先`
                  : `共 ${count} 条记录 · 最近观看优先`}
            </Typography>
          </>
        )}

        {/* 结果：日期分组列表 */}
        {loading && histories.length === 0 ? (
          <Box sx={{ mt: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={132} />
            ))}
          </Box>
        ) : groups.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>
              {filtered ? '没有找到相关记录' : '还没有观看记录'}
            </Typography>
            {filtered && (
              <Box sx={{ mt: 2 }}>
                <Button
                  onClick={() => {
                    setQuery('');
                    setSource('all');
                  }}
                  sx={{
                    bgcolor: theme.m3.secondaryContainer,
                    color: theme.m3.onSecondaryContainer,
                    '&:hover': { bgcolor: theme.m3.secondaryContainer },
                  }}
                >
                  查看全部记录
                </Button>
              </Box>
            )}
          </Box>
        ) : (
          groups.map((group) => (
            <Box key={group.key}>
              <KzHistoryGroupHeader label={group.label} count={group.items.length} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.items.map((item) => (
                  <KzHistoryTile
                    key={item.id ?? item.episodeUrl}
                    item={item}
                    editing={editing || clearing}
                    exiting={Boolean(item.id && exiting.includes(item.id))}
                    onPlay={resumePlay}
                    onDelete={removeHistory}
                    swipeable={compact}
                  />
                ))}
              </Box>
            </Box>
          ))
        )}
      </Box>

      {/* 清空确认（原版 AlertDialog：icon + 条数说明 + error 色确认按钮） */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} maxWidth="xs" fullWidth>
        <DialogTitle>清空历史记录？</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>
            将删除全部 {histories.length} 条观看记录，包括在线和缓存记录。此操作无法撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmClear(false)}>取消</Button>
          <Button
            onClick={clearAll}
            sx={{
              bgcolor: theme.m3.error,
              color: theme.m3.onError,
              '&:hover': { bgcolor: theme.m3.error },
            }}
          >
            清空全部
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HistoryPage;
