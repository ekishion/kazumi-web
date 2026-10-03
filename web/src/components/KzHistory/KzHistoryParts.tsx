import React from 'react';
import {
  Box,
  ButtonBase,
  Card,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { Play, Trash2 } from 'lucide-react';
import { AutoFadeImage } from '../common/AutoFadeImage';
import type { HistoryRecord } from '../../types';

/**
 * 历史页私有零件，对齐原版：
 *  - Kazumi/lib/pages/history/history_list_view.dart（日期分组 / 搜索 / 来源筛选 / 空态）
 *  - Kazumi/lib/pages/history/history_record_tile.dart（surfaceContainerLow 卡片、圆角 12、
 *    封面 12、进度色 primary、删除用 errorContainer）
 */

export const KZ_HISTORY_PAGE_PAD = 12;

export const KZ_HISTORY_SOURCES = [
  { id: 'all', label: '全部' },
  { id: 'online', label: '在线' },
  { id: 'offline', label: '缓存' },
] as const;
export type KzHistorySource = (typeof KZ_HISTORY_SOURCES)[number]['id'];

/* ------------------------------------------------------------------ *
 * 展示辅助（对齐 history_record_tile.dart 的 _position / time 拼接）
 * ------------------------------------------------------------------ */
export function kzFormatPosition(ms: number): string {
  const total = Math.floor((ms || 0) / 1000);
  if (total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return h > 0 ? `看到 ${h}:${pad(m)}:${pad(s)}` : `看到 ${m}:${pad(s)}`;
}

export function kzFormatClock(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function kzDayLabel(value: string | undefined, now = new Date()): string {
  const date = value ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) return '更早';
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 86400000;
  if (day === today) return '今天';
  if (day === today - oneDay) return '昨天';
  const prefix = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`;
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日`;
}

export type KzHistoryGroup = {
  key: string;
  label: string;
  items: HistoryRecord[];
};

/** 按天分组，组内按时间倒序（对齐 groupHistoryEntries） */
export function kzGroupHistory(
  entries: HistoryRecord[],
  query: string,
  source: KzHistorySource,
): KzHistoryGroup[] {
  const keyword = query.trim().toLowerCase();
  const filtered = entries
    .filter((entry) => {
      if (keyword && !entry.bangumiName.toLowerCase().includes(keyword) && !entry.episodeName.toLowerCase().includes(keyword)) {
        return false;
      }
      // 后端历史记录无 entryKind 字段，默认按「在线」处理
      if (source === 'offline') return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '') || (b.id ?? 0) - (a.id ?? 0));

  const groups: KzHistoryGroup[] = [];
  filtered.forEach((entry) => {
    const label = kzDayLabel(entry.updatedAt);
    const bucket = groups.find((group) => group.label === label);
    if (bucket) bucket.items.push(entry);
    else groups.push({ key: label, label, items: [entry] });
  });
  return groups;
}

/* ------------------------------------------------------------------ *
 * 日期分组标题（对齐 _buildRow 的分组头：titleLarge、w700→w500、右侧条数）
 * ------------------------------------------------------------------ */
export const KzHistoryGroupHeader: React.FC<{ label: string; count: number }> = ({
  label,
  count,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: '4px', pt: '24px', pb: '12px' }}>
      <Typography sx={{ flex: 1, fontSize: 18, fontWeight: 500, color: theme.m3.onSurface }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: theme.m3.onSurfaceVariant }}>
        {count} 条
      </Typography>
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * 来源筛选胶囊（对齐 _filter：选中 secondaryContainer + 对勾，250ms 形变）
 * ------------------------------------------------------------------ */
interface KzHistoryFilterProps {
  value: KzHistorySource;
  onChange: (value: KzHistorySource) => void;
}

export const KzHistoryFilters: React.FC<KzHistoryFilterProps> = ({ value, onChange }) => {
  const theme = useTheme();
  const duration = theme.motion.durations.medium;
  const ease = theme.motion.easings.standard;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {KZ_HISTORY_SOURCES.map((source) => {
        const selected = value === source.id;
        return (
          <ButtonBase
            key={source.id}
            onClick={() => onChange(source.id)}
            aria-pressed={selected}
            sx={{
              minHeight: 48,
              pl: selected ? '16px' : '20px',
              pr: '20px',
              gap: '8px',
              borderRadius: selected ? '20px' : '12px',
              bgcolor: selected ? theme.m3.secondaryContainer : theme.m3.surfaceContainerLow,
              color: selected ? theme.m3.onSecondaryContainer : theme.m3.onSurfaceVariant,
              fontSize: 14,
              fontWeight: selected ? 500 : 400,
              transition: `border-radius ${duration}ms ${ease}, background-color ${duration}ms ${ease}, color ${duration}ms ${ease}, padding ${duration}ms ${ease}`,
            }}
          >
            {selected && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12 5 5L20 6" />
              </svg>
            )}
            {source.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * 单条记录（对齐 HistoryRecordTile：圆角 12、内边距 16、封面 12、
 * 标题 w500、集数 onSurfaceVariant、进度 primary、来源 · 时间 bodySmall）
 * ------------------------------------------------------------------ */
interface KzHistoryTileProps {
  item: HistoryRecord;
  editing: boolean;
  exiting: boolean;
  onPlay: (item: HistoryRecord) => void;
  onDelete: (item: HistoryRecord) => void;
  /** 滑动删除：仅触屏设备（原版 Dismissible endToStart） */
  swipeable: boolean;
}

export const KzHistoryTile: React.FC<KzHistoryTileProps> = ({
  item,
  editing,
  exiting,
  onPlay,
  onDelete,
  swipeable,
}) => {
  const theme = useTheme();
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [dragX, setDragX] = React.useState(0);
  const position = kzFormatPosition(item.positionMs);
  const progress =
    item.durationMs > 0 ? Math.min(100, Math.max(0, (item.positionMs / item.durationMs) * 100)) : 0;
  const clock = kzFormatClock(item.updatedAt);

  const onTouchStart = (event: React.TouchEvent) => {
    if (!swipeable || editing) return;
    setTouchStart(event.touches[0].clientX);
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (touchStart === null) return;
    setDragX(Math.min(0, event.touches[0].clientX - touchStart));
  };
  const onTouchEnd = () => {
    if (dragX < -72) onDelete(item);
    setTouchStart(null);
    setDragX(0);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        bgcolor: theme.m3.errorContainer,
        animation: exiting
          ? `kzHistoryOut ${theme.motion.durations.fast}ms ${theme.motion.easings.standard} both`
          : undefined,
        '@keyframes kzHistoryOut': { from: { opacity: 1 }, to: { opacity: 0 } },
      }}
    >
      {/* 滑动删除底层（原版 Dismissible background） */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          pr: '24px',
          color: theme.m3.onErrorContainer,
        }}
      >
        <Trash2 size={22} />
      </Box>

      <Card
        elevation={0}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        sx={{
          position: 'relative',
          transform: dragX ? `translateX(${dragX}px)` : 'none',
          transition: touchStart === null ? `transform ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}` : 'none',
        }}
      >
        {/* 卡片本体用底层 ButtonBase 承载点击，内容与操作按钮浮在其上，
            对齐原版 HistoryRecordTile 的 Positioned.fill(InkWell) 结构 */}
        {!editing && (
          <ButtonBase
            focusRipple
            onClick={() => onPlay(item)}
            aria-label={`继续播放 ${item.bangumiName}`}
            sx={{ position: 'absolute', inset: 0, borderRadius: '12px' }}
          />
        )}

        <Box sx={{ position: 'relative', zIndex: 1, pointerEvents: 'none', p: '16px' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            {/* 封面 12 圆角，容器裁切 */}
            <Box
              sx={{
                width: { xs: 60, sm: 72 },
                height: { xs: 84, sm: 101 },
                flexShrink: 0,
                borderRadius: '12px',
                overflow: 'hidden',
                bgcolor: theme.m3.surfaceContainerHighest,
                position: 'relative',
              }}
            >
              {item.coverUrl ? (
                <AutoFadeImage
                  src={item.coverUrl}
                  alt={item.bangumiName}
                  loading="lazy"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.m3.onSurfaceVariant,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9h18M8 4v5" />
                  </svg>
                </Box>
              )}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  color: theme.m3.onSurface,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.bangumiName}
              </Typography>
              <Typography
                sx={{
                  mt: '6px',
                  fontSize: 14,
                  lineHeight: 1.4,
                  color: theme.m3.onSurfaceVariant,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.episodeName}
              </Typography>

              {position && (
                <Typography sx={{ mt: '4px', fontSize: 12, fontWeight: 500, color: theme.m3.primary }}>
                  {position}
                </Typography>
              )}

              <Typography sx={{ mt: '8px', fontSize: 12, lineHeight: 1.4, color: theme.m3.onSurfaceVariant }}>
                {['在线', clock].filter(Boolean).join(' · ')}
              </Typography>

              {item.durationMs > 0 && (
                <Box
                  sx={{
                    mt: '8px',
                    height: 4,
                    borderRadius: '2px',
                    bgcolor: theme.m3.surfaceContainerHighest,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      width: `${progress}%`,
                      height: '100%',
                      borderRadius: '2px',
                      bgcolor: theme.m3.primary,
                      transition: `width ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                    }}
                  />
                </Box>
              )}
            </Box>

            {!editing && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, pointerEvents: 'auto' }}>
                <Tooltip title="继续播放">
                  <IconButton
                    aria-label="继续播放"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlay(item);
                    }}
                    sx={{
                      width: 48,
                      height: 48,
                      bgcolor: theme.m3.primaryContainer,
                      color: theme.m3.onPrimaryContainer,
                      '&:hover': { bgcolor: theme.m3.primaryContainer },
                    }}
                  >
                    <Play size={20} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="删除记录">
                  <IconButton
                    aria-label="删除记录"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(item);
                    }}
                    sx={{ width: 48, height: 48, color: theme.m3.onSurfaceVariant }}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}

            {editing && (
              <IconButton
                aria-label="删除记录"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(item);
                }}
                sx={{
                  width: 48,
                  height: 48,
                  flexShrink: 0,
                  pointerEvents: 'auto',
                  bgcolor: theme.m3.errorContainer,
                  color: theme.m3.onErrorContainer,
                  '&:hover': { bgcolor: theme.m3.errorContainer },
                }}
              >
                <Trash2 size={18} />
              </IconButton>
            )}
          </Box>
        </Box>
      </Card>
    </Box>
  );
};
