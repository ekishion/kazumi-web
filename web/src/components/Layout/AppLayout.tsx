import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Fab, Typography, useTheme } from '@mui/material';
import { Activity, Heart, Home, Search as SearchIcon, Settings } from 'lucide-react';

import { PopularPage } from '../../pages/PopularPage';
import { TimelinePage } from '../../pages/TimelinePage';
import { CollectPage } from '../../pages/CollectPage';
import { SettingsPage } from '../../pages/SettingsPage';
import { RouteTransition } from '../Transitions/RouteTransition';
import { PageScrollContext } from './PageScrollContext';

/**
 * 外壳对齐原版 Kazumi/lib/pages/menu/menu.dart：
 *  - 竖屏 → 底部 M3 NavigationBar
 *  - 横屏/桌面 → 左侧 NavigationRail：groupAlignment 1（图标组沉底）、
 *    labelType selected（仅选中项显示文字）、leading = FAB(elevation 0) 搜索
 *  - 内容区左上/左下 16px 圆角
 *  - 4 个标签页常驻挂载（原版 RouterOutlet 不卸载），切换仅 70ms 淡入
 *  - /info /play /search /history /rules 为全屏推入路由（原版覆盖整个外壳）
 */

type TabDef = {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; fill?: string }>;
  filled?: boolean;
  Page: React.ComponentType;
};

const TABS: TabDef[] = [
  { path: '/', label: '推荐', Icon: Home, filled: true, Page: PopularPage },
  { path: '/timeline', label: '时间表', Icon: Activity, Page: TimelinePage },
  { path: '/collect', label: '追番', Icon: Heart, filled: true, Page: CollectPage },
  { path: '/settings', label: '我的', Icon: Settings, Page: SettingsPage },
];

/** 原版按屏幕方向切换导航形态 */
function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return portrait;
}

/** M3 选中指示器：secondaryContainer 胶囊 + 200ms 色彩过渡（对齐 NavigationBar/Rail 默认动画） */
const Indicator: React.FC<{ selected: boolean; children: React.ReactNode; width?: number }> = ({
  selected,
  children,
  width = 56,
}) => {
  const theme = useTheme();
  const ease = theme.motion.easings.standard;
  return (
    <Box
      sx={{
        width,
        height: 32,
        borderRadius: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? theme.m3.secondaryContainer : 'transparent',
        color: selected ? theme.m3.onSecondaryContainer : theme.m3.onSurfaceVariant,
        transition: `background-color ${theme.motion.durations.medium}ms ${ease}, color ${theme.motion.durations.medium}ms ${ease}`,
      }}
    >
      {children}
    </Box>
  );
};

/** 单个常驻标签页：独立滚动容器（滚动位置随挂载保留），并通过上下文暴露给页面 */
const TabPane: React.FC<{ active: boolean; children: React.ReactNode }> = ({
  active,
  children,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <Box ref={scrollRef} className={`kz-scroll ${active ? 'kz-tab-fade' : ''}`} sx={{ height: '100%' }}>
      <PageScrollContext.Provider value={scrollRef}>{children}</PageScrollContext.Provider>
    </Box>
  );
};

export const AppLayout: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isPortrait = useIsPortrait();

  const activeIndex = useMemo(() => {
    const path = location.pathname;
    if (path === '/' || path === '') return 0;
    const seg = `/${path.split('/')[1]}`;
    return TABS.findIndex((t) => t.path === seg);
  }, [location.pathname]);

  const isTab = activeIndex >= 0;

  // 标签页懒挂载：首次访问才渲染，之后常驻（既避免启动时 4 个页面同时请求，
  // 又保证切回来时状态与滚动位置都在，对齐原版 RouterOutlet 的行为）
  const [visited, setVisited] = useState<number[]>(() => (activeIndex >= 0 ? [activeIndex] : [0]));
  useEffect(() => {
    if (activeIndex >= 0 && !visited.includes(activeIndex)) {
      setVisited((prev) => [...prev, activeIndex]);
    }
  }, [activeIndex, visited]);

  /* --------- 标签页内容：全部常驻，仅切换显隐（状态与滚动位置不丢失） --------- */
  const tabStack = (
    <Box sx={{ position: 'relative', height: '100%', minHeight: 0 }}>
      {TABS.map((tab, index) => {
        const active = index === activeIndex;
        return (
          <Box
            key={tab.path}
            aria-hidden={!active}
            sx={{ position: 'absolute', inset: 0, display: active ? 'block' : 'none' }}
          >
            {visited.includes(index) && (
              <TabPane active={active}>
                <tab.Page />
              </TabPane>
            )}
          </Box>
        );
      })}
    </Box>
  );

  /* ------------------------------ 竖屏：底部导航 ------------------------------ */
  const shellNode = isPortrait ? (
      <Box
        sx={{
          height: '100vh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: theme.m3.surface,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          {tabStack}
        </Box>

        <Box
          component="nav"
          sx={{
            height: 80,
            flexShrink: 0,
            bgcolor: theme.m3.surfaceContainer,
            display: 'grid',
            gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
            alignItems: 'center',
          }}
        >
          {TABS.map((tab, index) => {
            const selected = index === activeIndex;
            return (
              <ButtonBase
                key={tab.path}
                onClick={() => navigate(tab.path)}
                focusRipple
                sx={{
                  height: 80,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 0.5,
                  borderRadius: 0,
                }}
              >
                <Indicator selected={selected} width={64}>
                  <tab.Icon
                    size={24}
                    strokeWidth={selected ? 2.4 : 2}
                    fill={selected && tab.filled ? 'currentColor' : 'none'}
                  />
                </Indicator>
                <Typography
                  sx={{
                    fontSize: 12,
                    lineHeight: '16px',
                    fontWeight: 500,
                    color: selected ? theme.m3.onSurface : theme.m3.onSurfaceVariant,
                    transition: `color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                  }}
                >
                  {tab.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>
  ) : (
  /* ---------------------------- 横屏/桌面：导航栏 ---------------------------- */
    <Box
      sx={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        bgcolor: theme.m3.surfaceContainer,
        overflow: 'hidden',
      }}
    >
      <Box
        component="nav"
        sx={{
          width: 80,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          gap: 1.5,
          bgcolor: theme.m3.surfaceContainer,
        }}
      >
        {/* leading：搜索 FAB（原版 elevation 0、primaryContainer） */}
        <Fab
          size="medium"
          aria-label="搜索"
          onClick={() => navigate('/search')}
          sx={{ width: 48, height: 48, minHeight: 48 }}
        >
          <SearchIcon size={22} strokeWidth={2.4} />
        </Fab>

        {/* groupAlignment: 1 —— 图标组沉底 */}
        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            width: '100%',
          }}
        >
          {TABS.map((tab, index) => {
            const selected = index === activeIndex;
            return (
              <ButtonBase
                key={tab.path}
                onClick={() => navigate(tab.path)}
                focusRipple
                sx={{
                  width: '100%',
                  py: 0.75,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.25,
                  borderRadius: 0,
                }}
              >
                <Indicator selected={selected}>
                  <tab.Icon
                    size={24}
                    strokeWidth={selected ? 2.4 : 2}
                    fill={selected && tab.filled ? 'currentColor' : 'none'}
                  />
                </Indicator>
                {/* labelType: selected —— 仅选中项显示文字 */}
                <Typography
                  sx={{
                    fontSize: 12,
                    lineHeight: '16px',
                    fontWeight: 500,
                    height: 16,
                    opacity: selected ? 1 : 0,
                    color: theme.m3.onSurface,
                    transition: `opacity ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                  }}
                >
                  {tab.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      {/* 内容区：左上/左下 16px 圆角（menu.dart:172） */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          overflow: 'hidden',
          bgcolor: theme.m3.surface,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        }}
      >
        {tabStack}
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        position: 'relative',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        bgcolor: theme.m3.surfaceContainer,
      }}
    >
      {/* 标签页外壳：推入全屏路由时只隐藏、不卸载。
          对齐原版常驻 RouterOutlet —— 返回后滚动位置与页内状态都还在。 */}
      <Box sx={{ position: 'absolute', inset: 0, display: isTab ? 'block' : 'none' }}>
        {shellNode}
      </Box>

      {/* 全屏推入路由（原版覆盖整个外壳） */}
      {!isTab && (
        <RouteTransition>
          <Box
            className="kz-scroll"
            sx={{ position: 'absolute', inset: 0, zIndex: 10, bgcolor: theme.m3.surface }}
          >
            <Outlet />
          </Box>
        </RouteTransition>
      )}
    </Box>
  );
};

export default AppLayout;
