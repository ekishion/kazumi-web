import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import { Check, Copy } from 'lucide-react';

export interface KzKvItem {
  key?: string;
  label: string;
  value: React.ReactNode;
  copyableText?: string;
}

export interface KzKvListProps {
  items: KzKvItem[];
  dense?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * 键值对摘要列表：用于代理诊断面板、元数据展示等场景。
 * 紧凑、等宽代码字阶支持、可选复制。
 */
export const KzKvList: React.FC<KzKvListProps> = ({ items, dense = false, sx }) => {
  const theme = useTheme();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: dense ? '6px' : '10px',
        width: '100%',
        ...sx,
      }}
    >
      {items.map((item, idx) => {
        const itemKey = item.key || item.label || String(idx);
        const isCopied = copiedKey === itemKey;

        return (
          <Box
            key={itemKey}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              fontSize: dense ? 12 : 13,
              lineHeight: 1.4,
            }}
          >
            <Typography
              component="span"
              sx={{
                flexShrink: 0,
                color: theme.m3.onSurfaceVariant,
                fontSize: 'inherit',
                fontWeight: 500,
              }}
            >
              {item.label}
            </Typography>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                minWidth: 0,
                overflow: 'hidden',
                justifyContent: 'flex-end',
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: 'inherit',
                  color: theme.m3.onSurface,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.value}
              </Typography>

              {item.copyableText && (
                <Tooltip title={isCopied ? '已复制' : '复制'}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopy(itemKey, item.copyableText!)}
                    sx={{
                      p: '2px',
                      color: isCopied ? theme.m3.primary : theme.m3.onSurfaceVariant,
                    }}
                  >
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
