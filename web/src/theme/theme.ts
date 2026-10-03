/**
 * MUI 主题：由 M3 调色板驱动，形状/字体/组件默认值对齐原版 Flutter Kazumi。
 * 依据见 Web/UI-SPEC.md。
 */
import { createTheme, alpha, type Theme } from '@mui/material/styles';
import { m3Scheme, applyOled, DEFAULT_SEED, type M3Roles } from './m3';
import { motion } from './motion';

const FONT_FAMILY = [
  'MiSans',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  'sans-serif',
].join(',');

/** M3 字阶（原版 useMaterial3 默认值） */
const typeScale = {
  displayLarge: { fontSize: 57, lineHeight: 64 / 57, letterSpacing: '-0.25px' },
  displayMedium: { fontSize: 45, lineHeight: 52 / 45, letterSpacing: '0px' },
  displaySmall: { fontSize: 36, lineHeight: 44 / 36, letterSpacing: '0px' },
  headlineLarge: { fontSize: 32, lineHeight: 40 / 32, letterSpacing: '0px' },
  headlineMedium: { fontSize: 28, lineHeight: 36 / 28, letterSpacing: '0px' },
  headlineSmall: { fontSize: 24, lineHeight: 32 / 24, letterSpacing: '0px' },
  titleLarge: { fontSize: 22, lineHeight: 28 / 22, letterSpacing: '0px' },
  titleMedium: { fontSize: 16, lineHeight: 24 / 16, letterSpacing: '0.15px', fontWeight: 500 },
  titleSmall: { fontSize: 14, lineHeight: 20 / 14, letterSpacing: '0.1px', fontWeight: 500 },
  bodyLarge: { fontSize: 16, lineHeight: 24 / 16, letterSpacing: '0.5px' },
  bodyMedium: { fontSize: 14, lineHeight: 20 / 14, letterSpacing: '0.25px' },
  bodySmall: { fontSize: 12, lineHeight: 16 / 12, letterSpacing: '0.4px' },
  labelLarge: { fontSize: 14, lineHeight: 20 / 14, letterSpacing: '0.1px', fontWeight: 500 },
  labelMedium: { fontSize: 12, lineHeight: 16 / 12, letterSpacing: '0.5px', fontWeight: 500 },
  labelSmall: { fontSize: 11, lineHeight: 16 / 11, letterSpacing: '0.5px', fontWeight: 500 },
} as const;

export function createAppTheme(
  mode: 'light' | 'dark',
  seedColor: string = DEFAULT_SEED,
  oledEnhance = false,
): Theme {
  const seed = seedColor && /^#?[0-9a-fA-F]{6}$/.test(seedColor) ? seedColor : DEFAULT_SEED;
  const schemes = m3Scheme(seed);
  let m3: M3Roles = schemes[mode];
  if (mode === 'dark' && oledEnhance) m3 = applyOled(m3);

  return createTheme({
    m3,
    motion,
    palette: {
      mode,
      primary: {
        main: m3.primary,
        contrastText: m3.onPrimary,
        light: m3.primaryContainer,
        dark: m3.primary,
      },
      secondary: {
        main: m3.secondaryContainer,
        contrastText: m3.onSecondaryContainer,
      },
      error: {
        main: m3.error,
        contrastText: m3.onError,
        light: m3.errorContainer,
      },
      warning: { main: m3.tertiary, contrastText: m3.onTertiary },
      info: { main: m3.tertiaryContainer, contrastText: m3.onTertiaryContainer },
      success: { main: m3.primary, contrastText: m3.onPrimary },
      background: { default: m3.surface, paper: m3.surfaceContainerLow },
      text: {
        primary: m3.onSurface,
        secondary: m3.onSurfaceVariant,
        disabled: alpha(m3.onSurface, 0.38),
      },
      divider: m3.outlineVariant,
      action: {
        active: m3.onSurfaceVariant,
        hover: alpha(m3.onSurface, 0.08),
        hoverOpacity: 0.08,
        selected: alpha(m3.onSurface, 0.12),
        selectedOpacity: 0.12,
        focus: alpha(m3.onSurface, 0.12),
        focusOpacity: 0.12,
        disabled: alpha(m3.onSurface, 0.38),
        disabledBackground: alpha(m3.onSurface, 0.12),
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT_FAMILY,
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 500,
      h1: { ...typeScale.displayLarge, fontWeight: 400 },
      h2: { ...typeScale.displayMedium, fontWeight: 400 },
      h3: { ...typeScale.displaySmall, fontWeight: 400 },
      h4: { ...typeScale.headlineLarge, fontWeight: 400 },
      h5: { ...typeScale.headlineMedium, fontWeight: 400 },
      h6: { ...typeScale.titleLarge, fontWeight: 400 },
      subtitle1: { ...typeScale.titleMedium },
      subtitle2: { ...typeScale.titleSmall },
      body1: { ...typeScale.bodyLarge },
      body2: { ...typeScale.bodyMedium },
      caption: { ...typeScale.bodySmall },
      overline: { ...typeScale.labelSmall, textTransform: 'none' },
      button: { ...typeScale.labelLarge, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: m3.surface,
            color: m3.onSurface,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none', borderRadius: 12 },
          rounded: { borderRadius: 12 },
        },
      },
      // 原版 Card：elevation 0、无描边，底色 surfaceContainerLow
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: m3.surfaceContainerLow,
            backgroundImage: 'none',
            border: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiCardActionArea: {
        styleOverrides: { root: { borderRadius: 'inherit' } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 9999, // M3 StadiumBorder
            minHeight: 40,
            padding: '10px 24px',
            fontWeight: 500,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          },
          text: { padding: '10px 16px' },
          sizeSmall: { minHeight: 32, padding: '6px 16px' },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 9999,
            padding: 8,
            '&:hover': { backgroundColor: alpha(m3.onSurface, 0.08) },
          },
        },
      },
      // M3 FAB：16px 圆角、primaryContainer 底；原版首页 FAB 无投影
      MuiFab: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor: m3.primaryContainer,
            color: m3.onPrimaryContainer,
            boxShadow: 'none',
            '&:hover': { backgroundColor: m3.primaryContainer, boxShadow: 'none' },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 500, fontSize: 13, height: 30 },
          filled: { backgroundColor: m3.surfaceContainerHighest },
          outlined: { borderColor: m3.outline },
          label: { paddingLeft: 10, paddingRight: 10 },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'transparent' },
        styleOverrides: {
          root: { backgroundColor: m3.surface, backgroundImage: 'none', boxShadow: 'none' },
        },
      },
      MuiToolbar: {
        styleOverrides: { root: { minHeight: 56 } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 28,
            backgroundColor: m3.surfaceContainerHigh,
            backgroundImage: 'none',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { ...typeScale.headlineSmall, fontWeight: 400, padding: '24px 24px 16px' },
        },
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: '0 24px 24px' } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 4, // M3 菜单默认形状
            backgroundColor: m3.surfaceContainer,
            backgroundImage: 'none',
            boxShadow: '0 2px 6px 2px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.3)',
            paddingTop: 8,
            paddingBottom: 8,
          },
          list: { paddingTop: 0, paddingBottom: 0 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: 14,
            minHeight: 40,
            paddingLeft: 12,
            paddingRight: 12,
            '&.Mui-selected': {
              backgroundColor: m3.secondaryContainer,
              color: m3.onSecondaryContainer,
            },
            '&.Mui-selected:hover': { backgroundColor: m3.secondaryContainer },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: m3.inverseSurface,
            color: m3.inverseOnSurface,
            borderRadius: 4,
            fontSize: 12,
            padding: '4px 8px',
          },
          arrow: { color: m3.inverseSurface },
        },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: { backgroundColor: m3.surfaceContainerHighest, borderRadius: 12 },
          rounded: { borderRadius: 12 },
          text: { borderRadius: 6 },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 4, borderRadius: 2, backgroundColor: m3.surfaceContainerHighest },
          bar: { borderRadius: 2, backgroundColor: m3.primary },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 48 },
          indicator: { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: 14,
            minHeight: 48,
            minWidth: 0,
            padding: '12px 16px',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            '&.Mui-selected': {
              backgroundColor: m3.secondaryContainer,
              color: m3.onSecondaryContainer,
            },
            '&.Mui-selected:hover': { backgroundColor: m3.secondaryContainer },
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: { ...typeScale.bodyLarge },
          secondary: { ...typeScale.bodyMedium },
        },
      },
      MuiSwitch: { styleOverrides: { root: { padding: 8 } } },
      MuiSlider: { styleOverrides: { root: { color: m3.primary } } },
      MuiCheckbox: { styleOverrides: { root: { color: m3.onSurfaceVariant } } },
      MuiRadio: { styleOverrides: { root: { color: m3.onSurfaceVariant } } },
      MuiDivider: { styleOverrides: { root: { borderColor: m3.outlineVariant } } },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: m3.inverseSurface,
            color: m3.inverseOnSurface,
            borderRadius: 4,
            fontSize: 14,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: 'none',
            fontSize: 14,
          },
          colorInfo: {
            backgroundColor: m3.secondaryContainer,
            color: m3.onSecondaryContainer,
            '& .MuiAlert-icon': { color: m3.onSecondaryContainer },
          },
          colorWarning: {
            backgroundColor: m3.tertiaryContainer,
            color: m3.onTertiaryContainer,
            '& .MuiAlert-icon': { color: m3.onTertiaryContainer },
          },
          colorError: {
            backgroundColor: m3.errorContainer,
            color: m3.onErrorContainer,
            '& .MuiAlert-icon': { color: m3.onErrorContainer },
          },
          colorSuccess: {
            backgroundColor: m3.primaryContainer,
            color: m3.onPrimaryContainer,
            '& .MuiAlert-icon': { color: m3.onPrimaryContainer },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: m3.surfaceContainerLow, backgroundImage: 'none' },
        },
      },
      MuiBackdrop: {
        styleOverrides: { root: { backgroundColor: alpha(m3.scrim, 0.32) } },
      },
      MuiCircularProgress: { defaultProps: { color: 'primary' } },
    },
  });
}

export default createAppTheme;
