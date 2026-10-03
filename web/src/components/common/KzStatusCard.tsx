import React from 'react';
import { Box, Typography, useTheme, type SxProps, type Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type KzStatusSeverity = 'info' | 'warning' | 'error' | 'success';

export interface KzStatusCardProps {
  severity?: KzStatusSeverity;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  dense?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * M3 状态反馈卡：用于页面级或区块级提示与错误呈现。
 * 遵循 Web/UI-SPEC.md：圆角 12、无描边、无投影，背景与前景严格采用 M3 Container 角色色。
 */
export const KzStatusCard: React.FC<KzStatusCardProps> = ({
  severity = 'info',
  icon,
  title,
  description,
  actions,
  dense = false,
  sx,
}) => {
  const theme = useTheme();
  const m3 = theme.m3;
  const ease = theme.motion.easings.standard;
  const dur = theme.motion.durations.medium;

  const colorConfig = {
    info: {
      bg: m3.secondaryContainer,
      fg: m3.onSecondaryContainer,
      defaultIcon: <Info size={dense ? 18 : 22} />,
    },
    warning: {
      bg: m3.tertiaryContainer,
      fg: m3.onTertiaryContainer,
      defaultIcon: <AlertTriangle size={dense ? 18 : 22} />,
    },
    error: {
      bg: m3.errorContainer,
      fg: m3.onErrorContainer,
      defaultIcon: <AlertCircle size={dense ? 18 : 22} />,
    },
    success: {
      bg: m3.primaryContainer,
      fg: m3.onPrimaryContainer,
      defaultIcon: <CheckCircle2 size={dense ? 18 : 22} />,
    },
  }[severity];

  return (
    <Box
      sx={{
        borderRadius: '12px',
        bgcolor: colorConfig.bg,
        color: colorConfig.fg,
        p: dense ? '12px 14px' : '16px 20px',
        boxShadow: 'none',
        border: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: dense ? '8px' : '12px',
        transition: `background-color ${dur}ms ${ease}, color ${dur}ms ${ease}`,
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: dense ? 1.25 : 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colorConfig.fg,
            mt: '2px',
            flexShrink: 0,
          }}
        >
          {icon ?? colorConfig.defaultIcon}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 500,
              fontSize: dense ? 14 : 15,
              lineHeight: 1.4,
              color: colorConfig.fg,
            }}
          >
            {title}
          </Typography>

          {description && (
            <Typography
              sx={{
                mt: 0.5,
                fontSize: dense ? 12.5 : 13.5,
                lineHeight: 1.5,
                color: alpha(colorConfig.fg, 0.85),
                wordBreak: 'break-word',
              }}
            >
              {description}
            </Typography>
          )}
        </Box>
      </Box>

      {actions && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            mt: dense ? 0.5 : 1,
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
};
