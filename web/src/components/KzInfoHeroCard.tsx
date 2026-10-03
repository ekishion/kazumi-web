import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Rating,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Check, Clock, Heart, HeartCrack, HeartOff, Star } from 'lucide-react';

import { AutoFadeImage } from './common/AutoFadeImage';

export interface KzInfoHeroCardProps {
  /** useParams 的 id，用于 Hero 共享元素名 */
  id: string;
  /** Bangumi 详情（/bangumi/subject/:id） */
  subject: any | null;
  /** 首次加载（无缓存）时显示骨架 */
  loading?: boolean;
  /** 首屏占位：从推荐/时间表缓存里取到的同 id 海报，保证共享元素在第一次渲染就存在 */
  placeholderCover?: string;
  placeholderTitle?: string;
  /** 0 = 未追；1 想看 / 2 在看 / 3 看过 / 4 搁置 / 5 抛弃 */
  collectStatus: number;
  onCollect: (status: number) => void;
}

/** Bangumi 收藏状态（与原版 CollectType 语义一致，取值按 Bangumi API） */
const COLLECT_OPTIONS: Array<{ status: number; label: string }> = [
  { status: 2, label: '在看' },
  { status: 1, label: '想看' },
  { status: 3, label: '看过' },
  { status: 4, label: '搁置' },
  { status: 5, label: '抛弃' },
];

const collectIcon = (status: number, size = 18) => {
  switch (status) {
    case 2:
      return <Heart size={size} fill="currentColor" />;
    case 1:
      return <Star size={size} fill="currentColor" />;
    case 3:
      return <Check size={size} />;
    case 4:
      return <Clock size={size} />;
    case 5:
      return <HeartCrack size={size} />;
    default:
      return <HeartOff size={size} />;
  }
};

const stateLayer = (color: string, opacity = 0.08) =>
  `linear-gradient(${alpha(color, opacity)}, ${alpha(color, opacity)})`;

/**
 * 详情页顶栏总高（标题行 56 + TabBar 48），与 InfoPage 的 sticky 头部一致。
 * 头图用负上边距 + 等值内边距向上延伸到页面顶部，
 * 让模糊海报背景能透到（未滚动时标题行透明的）顶栏后面 —— 对齐原版 flexibleSpace 的效果；
 * TabBar 那 48px 由 InfoPage 用页面底色盖住（原版背景止于 TabBar 上方）。
 */
const STICKY_HEADER_HEIGHT = 104;

/**
 * 详情页头图卡片，对齐原版 `BangumiInfoCardV`
 * （Kazumi/lib/bean/card/bangumi_info_card.dart）+ `_InfoHeaderBackground`（info_page.dart）：
 *  - 模糊海报背景（blur 15 / opacity .4，向下渐隐到页面底色）
 *  - 标题 headlineSmall(24, w400→w500)
 *  - 海报 AspectRatio 0.65、圆角 12（原版 Hero(tag: id) → Web 用 viewTransitionName）
 *  - 放送开始 / N 人评分 + 星级 / Bangumi Ranked，数值 primary、20px
 *  - 评分透视柱状图：10 柱、宽 20、顶部圆角 5、默认 disabledColor（38% onSurface）
 *  - 收藏按钮：FilledButton 120x40 + 状态菜单（原版 CollectButton.extend）
 */
export const KzInfoHeroCard: React.FC<KzInfoHeroCardProps> = ({
  id,
  subject,
  loading = false,
  placeholderCover,
  placeholderTitle,
  collectStatus,
  onCollect,
}) => {
  const theme = useTheme();
  /** 原版 voteBarChart 仅在 width >= LayoutBreakpoint.compact(600) 时显示 */
  const showChart = useMediaQuery(theme.breakpoints.up('sm'));
  const [collectAnchor, setCollectAnchor] = useState<null | HTMLElement>(null);

  const title = subject ? subject.name_cn || subject.name || '' : '';
  const cover = subject
    ? subject.images?.large || subject.images?.common || subject.images?.medium || ''
    : '';
  const airDate: string = subject?.date || '';
  const ratingScore = Number(subject?.rating?.score) || 0;
  const ratingTotal = Number(subject?.rating?.total) || 0;
  const rank = Number(subject?.rating?.rank) || 0;

  const count: Record<string, unknown> = subject?.rating?.count ?? {};
  const values = Array.from({ length: 10 }, (_, index) => Number(count[String(index + 1)]) || 0);
  const maxVotes = Math.max(...values, 1);
  const totalVotes = ratingTotal || values.reduce((sum, value) => sum + value, 0);

  const currentLabel =
    COLLECT_OPTIONS.find((option) => option.status === collectStatus)?.label ?? '未追';

  const collectButton = (
    <Button
      onClick={(event) => setCollectAnchor(event.currentTarget)}
      startIcon={collectIcon(collectStatus)}
      aria-label={`追番状态：${currentLabel}`}
      sx={{
        width: 120,
        height: 40,
        minHeight: 40,
        px: '12px',
        fontSize: 14,
        fontWeight: 500,
        bgcolor: theme.m3.primary,
        color: theme.m3.onPrimary,
        '&:hover': {
          bgcolor: theme.m3.primary,
          backgroundImage: stateLayer(theme.m3.onPrimary),
        },
      }}
    >
      {currentLabel}
    </Button>
  );

  if (loading) {
    return (
      <Box
        sx={{
          position: 'relative',
          px: '12px',
          pb: '16px',
          mt: `-${STICKY_HEADER_HEIGHT}px`,
          pt: `${STICKY_HEADER_HEIGHT}px`,
        }}
      >
        <Box sx={{ maxWidth: 950, mx: 'auto' }}>
          {placeholderTitle ? (
            <Typography
              component="h1"
              sx={{
                fontSize: 24,
                lineHeight: '32px',
                fontWeight: 500,
                color: theme.m3.onSurface,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {placeholderTitle}
            </Typography>
          ) : (
            <Skeleton variant="text" sx={{ width: '60%', height: 32 }} />
          )}

          <Box sx={{ display: 'flex', gap: '16px', mt: '16px' }}>
            {/* 共享元素必须在首屏就存在，否则 Hero morph 无法发生 */}
            <Box
              style={{ viewTransitionName: `kz-poster-${id}` }}
              sx={{
                width: { xs: 140, sm: 176 },
                height: { xs: 215, sm: 271 },
                flexShrink: 0,
                position: 'relative',
                borderRadius: '12px',
                overflow: 'hidden',
                bgcolor: theme.m3.surfaceContainerHighest,
              }}
            >
              {placeholderCover ? (
                <AutoFadeImage
                  src={placeholderCover}
                  alt={placeholderTitle}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Skeleton variant="rounded" sx={{ width: '100%', height: '100%', borderRadius: '12px' }} />
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Box key={index} sx={{ mb: '12px' }}>
                  <Skeleton variant="text" sx={{ width: 72, height: 18 }} />
                  <Skeleton variant="text" sx={{ width: 120, height: 28 }} />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        px: '12px',
        pb: '16px',
        mt: `-${STICKY_HEADER_HEIGHT}px`,
        pt: `${STICKY_HEADER_HEIGHT}px`,
      }}
    >
      {/* 模糊海报背景（原版 _InfoHeaderBackground） */}
      {cover ? (
        <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Box
            component="img"
            src={cover}
            alt=""
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(15px)',
              opacity: 0.4,
              transform: 'scale(1.12)',
              // 蒙版用 #000 仅作 alpha 通道，不参与配色
              maskImage: 'linear-gradient(to bottom, #000 80%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 80%, transparent 100%)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 48,
              background: `linear-gradient(to bottom, transparent, ${theme.m3.surface})`,
            }}
          />
        </Box>
      ) : null}

      <Box sx={{ position: 'relative', maxWidth: 950, mx: 'auto' }}>
        <Typography
          component="h1"
          sx={{
            fontSize: 24,
            lineHeight: '32px',
            fontWeight: 500,
            color: theme.m3.onSurface,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </Typography>

        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: 'flex-start',
            gap: '16px',
            mt: '16px',
          }}
        >
          {/* 海报：Hero 共享元素（原版 Hero(tag: bangumiItem.id)），比例 0.65 */}
          <Box
            style={{ viewTransitionName: `kz-poster-${id}` }}
            sx={{
              width: { xs: 140, sm: 176 },
              height: { xs: 215, sm: 271 },
              flexShrink: 0,
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              bgcolor: theme.m3.surfaceContainerHighest,
            }}
          >
            <AutoFadeImage
              src={cover}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Box>

          {/* 元信息列 */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              alignSelf: 'stretch',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              pt: '4px',
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 14, lineHeight: '20px', letterSpacing: '0.25px' }}>
                放送开始:
              </Typography>
              <Typography
                sx={{ fontSize: 20, lineHeight: '28px', fontWeight: 500, color: theme.m3.primary }}
              >
                {airDate || '未知'}
              </Typography>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 14, lineHeight: '20px', letterSpacing: '0.25px' }}>
                {ratingTotal} 人评分:
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Typography
                  sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: theme.m3.primary }}
                >
                  {ratingScore > 0 ? ratingScore.toFixed(1) : '暂无'}
                </Typography>
                <Rating
                  value={ratingScore / 2}
                  precision={0.5}
                  readOnly
                  size="small"
                  sx={{ color: theme.m3.primary, fontSize: 20 }}
                />
              </Box>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 14, lineHeight: '20px', letterSpacing: '0.25px' }}>
                Bangumi Ranked:
              </Typography>
              <Typography
                sx={{ fontSize: 20, lineHeight: '28px', fontWeight: 500, color: theme.m3.primary }}
              >
                {rank > 0 ? `#${rank}` : '暂无排名'}
              </Typography>
            </Box>

            <Box sx={{ mt: 'auto', pt: '8px', display: 'flex', alignItems: 'center' }}>
              {collectButton}
            </Box>
          </Box>

          {/* 评分透视 */}
          {showChart ? (
            <Box sx={{ width: { xs: '100%', sm: 220, md: 280 }, flexShrink: 0, pt: '4px' }}>
              <Typography sx={{ fontSize: 14, lineHeight: '20px', letterSpacing: '0.25px' }}>
                评分透视:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', aspectRatio: '2 / 1', mt: '16px' }}>
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                  {values.map((value, index) => (
                    <Tooltip
                      key={index}
                      arrow
                      placement="top"
                      title={`${totalVotes > 0 ? ((value / totalVotes) * 100).toFixed(2) : '0.00'}% (${value} 人)`}
                    >
                      <Box
                        sx={{
                          flex: 1,
                          height: '100%',
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          cursor: 'default',
                          '&:hover .kz-vote-bar': { backgroundColor: theme.m3.primary },
                        }}
                      >
                        <Box
                          className="kz-vote-bar"
                          sx={{
                            width: 20,
                            maxWidth: '100%',
                            height: `${(value / maxVotes) * 100}%`,
                            minHeight: value > 0 ? 2 : 0,
                            // 原版：默认 disabledColor(onSurface 38%)，按下/悬停时 primary
                            backgroundColor: alpha(theme.m3.onSurface, 0.38),
                            borderRadius: '5px 5px 0 0',
                            transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}, height ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                          }}
                        />
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
                <Box sx={{ height: 26, display: 'flex', gap: '2px' }}>
                  {values.map((_, index) => (
                    <Box
                      key={index}
                      sx={{ flex: 1, display: 'flex', justifyContent: 'center', pt: '10px' }}
                    >
                      <Typography sx={{ fontSize: 12, lineHeight: '16px', color: theme.m3.onSurfaceVariant }}>
                        {index + 1}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* 追番状态菜单（原版 CollectButton 的 menuChildren） */}
      <Menu
        anchorEl={collectAnchor}
        open={Boolean(collectAnchor)}
        onClose={() => setCollectAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 140 } } }}
      >
        {COLLECT_OPTIONS.map((option) => (
          <MenuItem
            key={option.status}
            selected={option.status === collectStatus}
            onClick={() => {
              setCollectAnchor(null);
              onCollect(option.status);
            }}
          >
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {collectIcon(option.status, 16)}
              {option.label}
            </Box>
          </MenuItem>
        ))}
        {collectStatus !== 0 && (
          <MenuItem
            onClick={() => {
              setCollectAnchor(null);
              onCollect(0);
            }}
          >
            未追（移除）
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};

export default KzInfoHeroCard;
