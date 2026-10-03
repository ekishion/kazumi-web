import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import { Box, Card, CardActionArea, Typography, useTheme } from '@mui/material';
import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AutoFadeImage } from './common/AutoFadeImage';

export interface KzTimelineCardProps {
  id: number;
  title: string;
  coverUrl?: string;
  /** 副标题（原版 _supportingText：集数 + 标签 / 原名） */
  meta?: string;
  /** 评分，<=0 显示「暂无评分」 */
  score?: number;
}

/**
 * 时间表横排卡片，对齐原版 `BangumiTimelineCard`
 * （Kazumi/lib/bean/card/bangumi_timeline_card.dart）：
 *  - Card(elevation: 0) + surfaceContainerLow 底色 + 抑制描边/投影（MUI 主题已设）
 *  - 卡片内容内边距 12、封面 88/80 宽、封面圆角随卡片裁剪
 *  - 布局：封面 + 标题（16px / 行高 1.5 / 2 行省略）+ 副标题（12px）+ 底部评分胶囊
 *  - Hero 共享元素 → Web 用 View Transitions 的 kz-poster-<id>
 *  - InkWell 波纹 → MUI CardActionArea
 */
export const KzTimelineCard: React.FC<KzTimelineCardProps> = ({
  id,
  title,
  coverUrl,
  meta,
  score,
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
      // 与原版 Hero(tag: item.id) 一致：封面作为共享元素飞入详情页
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
      sx={{
        borderRadius: '12px',
        overflow: 'hidden',
        // 内容 136 + 上下内边距 24（原版 heightFor）
        height: 160,
      }}
    >
      <CardActionArea
        onClick={open}
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: { xs: '12px', sm: '16px' },
          p: '12px',
          borderRadius: '12px',
        }}
      >
        {/* 封面：原版 width 88（compact 80），高度撑满内容区，圆角裁剪 */}
        <Box
          ref={posterRef}
          sx={{
            width: { xs: 80, sm: 88 },
            flexShrink: 0,
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: theme.m3.surfaceContainerHighest,
          }}
        >
          <AutoFadeImage
            src={coverUrl}
            alt={title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography
            title={title}
            sx={{
              color: theme.m3.onSurface,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </Typography>

          {meta ? (
            <Typography
              sx={{
                mt: '8px',
                fontSize: 12,
                lineHeight: 4 / 3,
                color: theme.m3.onSurfaceVariant,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {meta}
            </Typography>
          ) : null}

          {/* 底部：评分胶囊（原版 secondaryContainer + StadiumBorder） */}
          <Box sx={{ mt: 'auto', pt: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasScore ? (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  px: '10px',
                  py: '6px',
                  borderRadius: '9999px',
                  bgcolor: theme.m3.secondaryContainer,
                  color: theme.m3.onSecondaryContainer,
                }}
              >
                <Star size={16} strokeWidth={0} fill="currentColor" />
                <Typography sx={{ fontSize: 12, lineHeight: 4 / 3, fontWeight: 500 }}>
                  {score.toFixed(1)}
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12, lineHeight: 4 / 3, color: theme.m3.onSurfaceVariant }}>
                暂无评分
              </Typography>
            )}
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
};

export default KzTimelineCard;
