import React, { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme, useMediaQuery } from '@mui/material';

/**
 * 路由过渡，对齐原版 `pageTransitionsTheme2024`（Kazumi/lib/utils/constants.dart）：
 *   - 桌面（原版 Windows/Linux）→ FadeUpwards：淡入 + 上移，300ms，fastOutSlowIn
 *   - 移动（原版 Android/iOS）→ Cupertino：水平滑入，300ms
 * 通过 key={pathname} 在每次路由变化时重放动画。
 */
export const RouteTransition: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <div
      key={pathname}
      className={isCompact ? 'kz-route-slide-in' : 'kz-route-fade-upwards'}
      style={{ height: '100%', minHeight: 0 }}
    >
      {children}
    </div>
  );
};

export default RouteTransition;
