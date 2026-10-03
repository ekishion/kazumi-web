/**
 * M3 调色板：与原版 Flutter `ColorScheme.fromSeed(seed)` 同源。
 *
 * 原版依据：Kazumi/lib/app_widget.dart:138
 *   ThemeData(useMaterial3: true, colorSchemeSeed: color, ...)
 *   默认 color = Colors.green = #4CAF50
 *
 * 说明：@material/material-color-utilities 的 Scheme 未导出 Flutter 使用的
 * surfaceContainer* 系列角色，这里按 M3 规范用中性调色板色调推导
 * （light: 100/96/94/92/90，dark: 4/10/12/17/22），保证与原版一致。
 */
import {
  themeFromSourceColor,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities';

export interface M3Roles {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  shadow: string;
  scrim: string;
}

export interface M3SchemePair {
  light: M3Roles;
  dark: M3Roles;
}

/** 默认种子色，等同原版 Colors.green */
export const DEFAULT_SEED = '#4CAF50';

const schemeCache = new Map<string, M3SchemePair>();

function buildRoles(theme: ReturnType<typeof themeFromSourceColor>, mode: 'light' | 'dark'): M3Roles {
  const s = theme.schemes[mode] as unknown as Record<string, number>;
  const neutral = theme.palettes.neutral;
  const isDark = mode === 'dark';
  const argb = hexFromArgb;
  const tone = (t: number) => argb(neutral.tone(t));

  return {
    primary: argb(s.primary),
    onPrimary: argb(s.onPrimary),
    primaryContainer: argb(s.primaryContainer),
    onPrimaryContainer: argb(s.onPrimaryContainer),
    secondary: argb(s.secondary),
    onSecondary: argb(s.onSecondary),
    secondaryContainer: argb(s.secondaryContainer),
    onSecondaryContainer: argb(s.onSecondaryContainer),
    tertiary: argb(s.tertiary),
    onTertiary: argb(s.onTertiary),
    tertiaryContainer: argb(s.tertiaryContainer),
    onTertiaryContainer: argb(s.onTertiaryContainer),
    error: argb(s.error),
    onError: argb(s.onError),
    errorContainer: argb(s.errorContainer),
    onErrorContainer: argb(s.onErrorContainer),
    surface: argb(s.surface),
    onSurface: argb(s.onSurface),
    surfaceVariant: argb(s.surfaceVariant),
    onSurfaceVariant: argb(s.onSurfaceVariant),
    // Flutter M3 的 surface 容器层级（本库未导出，按色调推导）
    surfaceDim: tone(isDark ? 6 : 87),
    surfaceBright: tone(isDark ? 24 : 98),
    surfaceContainerLowest: tone(isDark ? 4 : 100),
    surfaceContainerLow: tone(isDark ? 10 : 96),
    surfaceContainer: tone(isDark ? 12 : 94),
    surfaceContainerHigh: tone(isDark ? 17 : 92),
    surfaceContainerHighest: tone(isDark ? 22 : 90),
    outline: argb(s.outline),
    outlineVariant: argb(s.outlineVariant),
    inverseSurface: argb(s.inverseSurface),
    inverseOnSurface: argb(s.inverseOnSurface),
    inversePrimary: argb(s.inversePrimary),
    shadow: argb(s.shadow),
    scrim: argb(s.scrim),
  };
}

/** 取某个种子色的 M3 双模式调色板（带缓存） */
export function m3Scheme(seedHex: string): M3SchemePair {
  const key = seedHex.toLowerCase();
  const cached = schemeCache.get(key);
  if (cached) return cached;

  let pair: M3SchemePair;
  try {
    const theme = themeFromSourceColor(argbFromHex(key));
    pair = { light: buildRoles(theme, 'light'), dark: buildRoles(theme, 'dark') };
  } catch {
    // 兜底：种子色非法时退回默认绿色
    const theme = themeFromSourceColor(argbFromHex(DEFAULT_SEED));
    pair = { light: buildRoles(theme, 'light'), dark: buildRoles(theme, 'dark') };
  }
  schemeCache.set(key, pair);
  return pair;
}

/**
 * OLED 纯黑增强，对齐原版 `oledDarkTheme`（Kazumi/lib/utils/theme.dart）：
 * 只覆写 surface / onSurface / onPrimary / onSecondary，其余角色保持 M3 值。
 */
export function applyOled(roles: M3Roles): M3Roles {
  return {
    ...roles,
    surface: '#000000',
    onSurface: '#FFFFFF',
    onPrimary: '#000000',
    onSecondary: '#000000',
  };
}

declare module '@mui/material/styles' {
  interface Theme {
    m3: M3Roles;
  }
  interface ThemeOptions {
    m3?: M3Roles;
  }
}
