import React, { useEffect, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { createAppTheme } from './theme/theme';
import { useAppStore } from './stores/useAppStore';
import { AppLayout } from './components/Layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

import { InfoPage } from './pages/InfoPage';
import { PlayerPage } from './pages/PlayerPage';
import { SearchPage } from './pages/SearchPage';
import { HistoryPage } from './pages/HistoryPage';
import { RulesPage } from './pages/RulesPage';

/**
 * 主题切换时的色彩过渡（对齐 Flutter MaterialApp 的 AnimatedTheme ≈200ms）。
 * 只在切换瞬间挂类，避免全站常驻 transition 的性能开销。
 */
function useThemeTransition(key: string): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const root = document.documentElement;
    root.classList.add('kz-theme-transition');
    const timer = window.setTimeout(
      () => root.classList.remove('kz-theme-transition'),
      220,
    );
    return () => window.clearTimeout(timer);
  }, [key]);
}

export const App: React.FC = () => {
  const { themeMode, primaryColor, oledEnhance } = useAppStore();
  // 原版 ThemeMode.system：跟随系统深浅色
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const effectiveMode: 'light' | 'dark' =
    themeMode === 'system' ? (prefersDark ? 'dark' : 'light') : themeMode;

  // 种子色驱动整套 M3 调色板（原版 ColorScheme.fromSeed）
  const theme = useMemo(
    () => createAppTheme(effectiveMode, primaryColor, oledEnhance),
    [effectiveMode, primaryColor, oledEnhance],
  );

  useThemeTransition(`${effectiveMode}|${primaryColor}|${oledEnhance}`);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* 4 个标签页由 AppLayout 常驻渲染（保持状态与滚动），此处仅占位路由 */}
            <Route path="/" element={<AppLayout />}>
              <Route index />
              <Route path="timeline" />
              <Route path="collect" />
              <Route path="settings" />

              {/* 全屏推入路由，对齐原版覆盖整个外壳的行为 */}
              <Route path="info/:id" element={<InfoPage />} />
              <Route path="play" element={<PlayerPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
