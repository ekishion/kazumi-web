/**
 * 动效令牌：取值对齐原版 Flutter Kazumi。
 *
 * 依据：
 *  - Kazumi/lib/utils/constants.dart  pageTransitionsTheme2024
 *      Windows/Linux → FadeUpwardsPageTransitionsBuilder（淡入 + 从 Offset(0,0.25) 上移，300ms，Curves.fastOutSlowIn）
 *      Android/iOS/macOS → CupertinoPageTransitionsBuilder（水平滑入）
 *  - Kazumi/lib/pages/index_module.dart
 *      _tabTransition: 70ms 淡入（标签页之间）
 *      _imagePreviewTransition: 220ms 淡入（图片预览）
 *  - Kazumi/lib/pages/popular/popular_page.dart
 *      滚动到顶 animateTo(0, 350ms, Curves.easeOut)
 *      分页进度条 AnimatedOpacity 300ms
 *  - Flutter MaterialApp 主题切换由 AnimatedTheme 承担，约 200ms
 */

export const durations = {
  /** 标签页切换（原版 _tabTransition） */
  tab: 70,
  /** 图片预览（原版 _imagePreviewTransition） */
  imagePreview: 220,
  /** 状态切换（hover / ripple / 淡入淡出） */
  fast: 150,
  /** 常规过渡 */
  medium: 250,
  /** 路由推入推出版本（MaterialPageRoute） */
  page: 300,
  /** 图片加载淡入 */
  image: 300,
  /** 回到顶部滚动（原版 350ms） */
  scroll: 350,
  /** 主题色过渡（Flutter AnimatedTheme） */
  theme: 200,
} as const;

export const easings = {
  /** Flutter Curves.fastOutSlowIn */
  fastOutSlowIn: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Flutter Curves.easeOut */
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  /** M3 标准缓动 */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** M3 强调缓动 */
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Cupertino 路由滑入 */
  cupertino: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;

/** 原版 FadeUpwards 的位移量：起始为页面高度的 25%（Web 上按比例取 2.5% 视觉等价且不产生空洞） */
export const FADE_UPWARDS_OFFSET = '2.5%';

export const motion = { durations, easings } as const;

declare module '@mui/material/styles' {
  interface Theme {
    motion: typeof motion;
  }
  interface ThemeOptions {
    motion?: typeof motion;
  }
}
