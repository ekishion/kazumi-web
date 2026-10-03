import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import { Box, Card, CardActionArea, Typography, useTheme } from '@mui/material';
import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AutoFadeImage } from './common/AutoFadeImage';

export interface KzSearchResultCardProps {
  id: number;
  title: string;
  coverUrl?: string;
  score?: number;
  year?: string;
}

/** 原版 `_SearchResultCard.coverAspectRatio = 0.7` */
const COVER_ASPECT_RATIO = 0.7;

/**
 * 搜索结果卡片，对齐原版 `_SearchResultCard`
 * （Kazumi/lib/pages/search/search_widgets.dart）：
 *  - 封面 AspectRatio 0.7 + 圆角裁剪（原版 16，按 Web 规范统一为 12）
 *  - 标题 titleSmall（14 / 行高 1.4 / 2 行省略）
 *  - 元信息行：primary 星标 14 + 评分 labelMedium + 年份 labelMedium(onSurfaceVariant)
 *  - 整卡 InkWell → CardActionArea；Hero → kz-poster-<id>（View Transitions）
 */
export const KzSearchResultCard: React.FC<KzSearchResultCardProps> = ({
  id,
  title,
  coverUrl,
  score,
  year,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement | null>(null);

  const open = () => {
    const el = posterRef.current;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    if (el && typeof doc.startViewTransition === 'function') {
      el.style.viewTransitionName = `kz-poster-${id}`;
      const transition = doc.startViewTransition(() => {
        flushSync(() => navigate(`/info/${id}`));
      });
      void transition.finished.finally(() => {
        el.style.viewTransitionName = '';
      });
      return;
    }
    navigate(`/info/${id}`);
  };

  const hasScore = typeof score === 'number' && score > 0;

  return (
    <Card
      elevation={0}
      sx={{ borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <CardActionArea
        onClick={open}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          borderRadius: '12px',
        }}
      >
        <Box
          ref={posterRef}
          sx={{
            position: 'relative',
            width: '100%',
            pt: `${(1 / COVER_ASPECT_RATIO) * 100}%`,
            bgcolor: theme.m3.surfaceContainerHighest,
            overflow: 'hidden',
            borderRadius: '12px',
          }}
        >
          <AutoFadeImage
            src={coverUrl}
            alt={title}
            loading="lazy"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </Box>

        <Box
          sx={{
            pt: '10px',
            px: '4px',
            pb: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <Typography
            title={title}
            sx={{
              fontSize: 14,
              lineHeight: 1.4,
              fontWeight: 500,
              height: '39.2px',
              color: theme.m3.onSurface,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', minHeight: 20 }}>
            {hasScore ? (
              <>
                <Star
                  size={14}
                  strokeWidth={0}
                  fill="currentColor"
                  style={{ color: theme.m3.primary }}
                />
                <Typography sx={{ fontSize: 12, lineHeight: '16px', letterSpacing: '0.5px' }}>
                  {score.toFixed(1)}
                </Typography>
              </>
            ) : null}
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                ml: hasScore ? '10px' : 0,
                fontSize: 12,
                lineHeight: '16px',
                letterSpacing: '0.5px',
                color: theme.m3.onSurfaceVariant,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {year ?? ''}
            </Typography>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
};

export default KzSearchResultCard;
