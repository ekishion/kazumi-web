import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import { Box, Card, CardActionArea, Typography, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AutoFadeImage } from '../common/AutoFadeImage';

interface BangumiCardProps {
  id: number;
  title: string;
  coverUrl?: string;
  /** 兼容既有调用方；原版卡片不展示评分与集数 */
  score?: number;
  totalEpisodes?: number;
}

/**
 * 垂直番剧卡片，对齐原版 `Kazumi/lib/bean/card/bangumi_card.dart`：
 *  - Card(elevation: 0, clipBehavior: antiAlias) → 无投影、按卡片圆角裁剪
 *  - AspectRatio(0.65) 竖版海报
 *  - 标题 padding 5/3/5/1、fontWeight w500、letterSpacing 0.3
 *  - InkWell 波纹（MUI CardActionArea）
 *  - Hero(tag: bangumiItem.id) 共享元素 → Web 侧用 View Transitions 实现
 */
export const BangumiCard: React.FC<BangumiCardProps> = ({ id, title, coverUrl }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement | null>(null);

  const open = () => {
    const el = posterRef.current;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    if (el && typeof doc.startViewTransition === 'function') {
      // 与原版 Hero 一致：海报作为共享元素飞入详情页
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

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '12px', // 原版 M3 Card 默认形状
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <CardActionArea onClick={open} sx={{ display: 'block', height: '100%' }}>
        <Box
          ref={posterRef}
          sx={{
            position: 'relative',
            width: '100%',
            pt: '153.85%', // 1 / 0.65
            bgcolor: theme.m3.surfaceContainerHighest,
            overflow: 'hidden',
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

        {/* 标题：原版 BangumiContent —— padding 5/3/5/1、w500、letterSpacing 0.3 */}
        <Typography
          title={title}
          sx={{
            padding: '3px 5px 1px',
            fontWeight: 500,
            letterSpacing: '0.3px',
            fontSize: 14,
            lineHeight: '20px',
            height: 43,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            color: theme.m3.onSurface,
          }}
        >
          {title}
        </Typography>
      </CardActionArea>
    </Card>
  );
};

export default BangumiCard;
