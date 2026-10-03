import React from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

export interface KzTimelineWeekSelectorProps {
  /** 7 个标签（当前季且是今天时显示「今天」，否则「周一」…） */
  labels: string[];
  /** 每天的放送数量 */
  counts: number[];
  /** 选中的星期下标 0~6 */
  value: number;
  onChange: (index: number) => void;
  loading?: boolean;
}

/** 原版 `_TimelineWeekSelector.heightFor`：40 + labelLarge(20) + labelSmall(16) */
const TRACK_HEIGHT = 68;
/** 原版 minTabWidth = (labelLarge 14 * 2 + 16).clamp(48, 112) → 窄屏 54 */
const MIN_TAB_WIDTH = 54;

/**
 * 星期选择器，对齐原版 `_TimelineWeekSelector`
 * （Kazumi/lib/pages/timeline/timeline_week_selector.dart）：
 *  - 容器 surfaceContainerLow、圆角 28、内边距 4
 *  - 选中指示器为 primary 胶囊（圆角 24），指示器动效使用 M3 medium(250ms) + standard 缓动
 *  - 每格：星期标签（labelLarge）+ 4px 间距 + 放送数（labelSmall）
 *  - 全站 InkWell 波纹 → 这里用 ButtonBase
 */
export const KzTimelineWeekSelector: React.FC<KzTimelineWeekSelectorProps> = ({
  labels,
  counts,
  value,
  onChange,
  loading = false,
}) => {
  const theme = useTheme();
  const total = labels.length || 7;
  const duration = theme.motion.durations.medium;
  const ease = theme.motion.easings.standard;

  return (
    <Box
      sx={{
        bgcolor: theme.m3.surfaceContainerLow,
        borderRadius: '28px',
        p: '4px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      <Box
        role="tablist"
        sx={{
          position: 'relative',
          display: 'grid',
          // 轨道宽度取 7 等分中的较大值，保证指示器宽度 = 单列宽度（translateX(100%) 恰好一列）
          minWidth: MIN_TAB_WIDTH * total,
          gridTemplateColumns: `repeat(${total}, minmax(${MIN_TAB_WIDTH}px, 1fr))`,
        }}
      >
        {/* 选中指示器：translateX(index * 100%) 恰好位移一个等宽列 */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `calc(100% / ${total})`,
            height: TRACK_HEIGHT,
            borderRadius: '24px',
            bgcolor: theme.m3.primary,
            transform: `translateX(${value * 100}%)`,
            transition: `transform ${duration}ms ${ease}`,
            pointerEvents: 'none',
          }}
        />

        {labels.map((label, index) => {
          const selected = index === value;
          return (
            <ButtonBase
              key={`${label}-${index}`}
              role="tab"
              aria-selected={selected}
              aria-label={`${label}，${loading ? '加载中' : `${counts[index] ?? 0} 部`}`}
              onClick={() => onChange(index)}
              focusRipple
              sx={{
                position: 'relative',
                zIndex: 1,
                height: TRACK_HEIGHT,
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: selected ? theme.m3.onPrimary : theme.m3.onSurfaceVariant,
                transition: `color ${duration}ms ${ease}`,
                // 原版 overlayColor: primary.withValues(alpha: .08)
                '&:hover': { backgroundColor: alpha(theme.m3.primary, 0.08) },
                '&.Mui-focusVisible': { backgroundColor: alpha(theme.m3.primary, 0.08) },
              }}
            >
              <Typography
                sx={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, letterSpacing: '0.1px' }}
              >
                {label}
              </Typography>
              <Box sx={{ height: 4 }} />
              <Typography
                sx={{ fontSize: 11, lineHeight: '16px', fontWeight: 500, letterSpacing: '0.5px' }}
              >
                {loading ? '—' : counts[index] ?? 0}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
};

export default KzTimelineWeekSelector;
