import React, { useEffect, useState } from 'react';
import { Box, Button, Skeleton, Typography, useTheme } from '@mui/material';
import { Users } from 'lucide-react';

import { apiService } from '../api/client';
import { cached, invalidate, peek } from '../data/requestCache';
import { AutoFadeImage } from './common/AutoFadeImage';

export interface KzInfoCharacterItem {
  id?: number;
  name?: string;
  relation?: string;
  images?: { large?: string; medium?: string; small?: string; grid?: string };
  actors?: Array<{ name?: string }>;
}

/**
 * 角色列表，对齐原版 `CharacterCard`
 * （Kazumi/lib/bean/card/character_card.dart）：
 *  - ListTile：leading = 头像（grid 图）、title = 角色名（1 行省略）、
 *    subtitle = 首位声优、trailing = 关系（主角 / 配角…）
 *  - 原版点击后打开角色详情弹窗，Web 版无对应接口，因此行不可点击（不使用 ButtonBase）
 *  - 数据缓存 `info:<id>:characters`，仅首次加载显示骨架
 */
export const KzInfoCharacterList: React.FC<{ subjectId: string }> = ({ subjectId }) => {
  const theme = useTheme();
  const cacheKey = `info:${subjectId}:characters`;

  const [items, setItems] = useState<KzInfoCharacterItem[] | null>(
    () => peek<KzInfoCharacterItem[]>(cacheKey) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!subjectId) return;
    let alive = true;
    if (peek<KzInfoCharacterItem[]>(cacheKey) === undefined) setItems(null);

    cached(cacheKey, () => apiService.getSubjectCharacters(subjectId) as Promise<KzInfoCharacterItem[]>)
      .then((data) => {
        if (!alive) return;
        setItems(Array.isArray(data) ? data : []);
        setFailed(false);
      })
      .catch((err) => {
        console.error('加载角色列表失败:', err);
        if (!alive) return;
        setFailed(true);
        setItems((prev) => prev ?? []);
      });

    return () => {
      alive = false;
    };
  }, [cacheKey, subjectId, reloadToken]);

  if (items === null) {
    return (
      <Box>
        {Array.from({ length: 4 }).map((_, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: '16px', mb: '8px', py: '4px' }}>
            <Skeleton variant="circular" width={40} height={40} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" sx={{ width: 120, height: 22 }} />
              <Skeleton variant="text" sx={{ width: 80, height: 18 }} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (failed && items.length === 0) {
    return (
      <Box
        sx={{
          py: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          color: theme.m3.onSurfaceVariant,
        }}
      >
        <Typography sx={{ fontSize: 16, color: theme.m3.onSurface }}>角色列表加载失败</Typography>
        <Typography sx={{ fontSize: 14 }}>请检查网络连接后重试。</Typography>
        <Button
          variant="contained"
          onClick={() => {
            invalidate(cacheKey);
            setReloadToken((token) => token + 1);
          }}
        >
          重试
        </Button>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
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
        <Users size={40} />
        <Typography sx={{ fontSize: 16, color: theme.m3.onSurface }}>暂无角色信息</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {items.map((item, index) => {
        const avatar = item.images?.grid || item.images?.medium || item.images?.small;
        const actor = item.actors?.[0]?.name?.trim();
        return (
          <Box
            key={item.id ?? index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              py: '4px',
              mb: '8px',
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                position: 'relative',
                borderRadius: '50%',
                overflow: 'hidden',
                bgcolor: theme.m3.surfaceContainerHighest,
              }}
            >
              <AutoFadeImage
                src={avatar}
                alt={item.name}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 16,
                  lineHeight: '24px',
                  color: theme.m3.onSurface,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </Typography>
              {actor ? (
                <Typography
                  sx={{
                    fontSize: 14,
                    lineHeight: '20px',
                    color: theme.m3.onSurfaceVariant,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {actor}
                </Typography>
              ) : null}
            </Box>

            {item.relation ? (
              <Typography
                sx={{ flexShrink: 0, fontSize: 14, lineHeight: '20px', color: theme.m3.onSurfaceVariant }}
              >
                {item.relation}
              </Typography>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
};

export default KzInfoCharacterList;
