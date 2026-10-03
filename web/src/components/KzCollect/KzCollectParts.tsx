import React from 'react';
import {
  Box,
  ButtonBase,
  Card,
  CardActionArea,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Check as CheckIcon,
  ChevronDown,
  Grid2x2,
  List as ListIcon,
} from 'lucide-react';
import { AutoFadeImage } from '../common/AutoFadeImage';
import type { CollectRecord } from '../../types';

/**
 * 追番页私有零件，对齐原版：
 *  - Kazumi/lib/pages/collect/collect_library_view.dart
 *  - Kazumi/lib/pages/collect/collect_library_controls.dart
 *  - Kazumi/lib/pages/collect/collect_library_card.dart
 *
 * 形状要点（UI-SPEC §3）：卡片 12、无描边、elevation 0；
 * 分类指示器 primaryContainer 胶囊；布局切换按钮 24/8 圆角形变。
 */

/** 页面左右留白（原版 compact 16 / 桌面 32，Web 侧按 UI-SPEC 取 12） */
export const KZ_PAGE_PAD = 12;

/** 原版 _collectCategories 顺序：全部 / 在看 / 想看 / 看过 / 搁置 / 抛弃 */
export const KZ_STATUS_TABS = [
  { id: 0, label: '全部' },
  { id: 2, label: '在看' },
  { id: 1, label: '想看' },
  { id: 3, label: '看过' },
  { id: 4, label: '搁置' },
  { id: 5, label: '抛弃' },
] as const;

export const KZ_COLLECT_LAYOUTS = ['cards', 'list'] as const;
export type KzCollectLayout = (typeof KZ_COLLECT_LAYOUTS)[number];

export const KZ_COLLECT_SORTS = [
  { id: 'recentlyChanged', label: '最近变更' },
  { id: 'title', label: '番剧名称' },
  { id: 'rating', label: '评分最高' },
  { id: 'airDate', label: '开播时间' },
] as const;
export type KzCollectSort = (typeof KZ_COLLECT_SORTS)[number]['id'];

export const kzStatusLabel = (status?: number): string =>
  KZ_STATUS_TABS.find((tab) => tab.id === (status ?? 2))?.label ?? '在看';

/* ------------------------------------------------------------------ *
 * 小圆角彩色徽章（原版 RuleTag / 状态徽章：圆角 8、字号 12、小内边距）
 * ------------------------------------------------------------------ */
interface KzBadgeProps {
  label: string;
  bg: string;
  fg: string;
}

export const KzBadge: React.FC<KzBadgeProps> = ({ label, bg, fg }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      px: '8px',
      py: '3px',
      borderRadius: '8px',
      bgcolor: bg,
      color: fg,
      fontSize: 12,
      lineHeight: '16px',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </Box>
);

/* ------------------------------------------------------------------ *
 * 分类胶囊（原版 TabBar：primaryContainer 指示器 + elastic 过渡）
 * ------------------------------------------------------------------ */
interface KzCategoryStripProps {
  active: number;
  onChange: (id: number) => void;
}

export const KzCategoryStrip: React.FC<KzCategoryStripProps> = ({ active, onChange }) => {
  const theme = useTheme();
  const ease = theme.motion.easings.standard;
  const duration = theme.motion.durations.medium;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        mx: '-4px',
        px: '4px',
      }}
    >
      {KZ_STATUS_TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <ButtonBase
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-pressed={selected}
            sx={{
              height: 48,
              minWidth: 64,
              px: '16px',
              borderRadius: '24px',
              flexShrink: 0,
              bgcolor: selected ? theme.m3.primaryContainer : 'transparent',
              color: selected ? theme.m3.onPrimaryContainer : theme.m3.onSurfaceVariant,
              fontWeight: selected ? 500 : 400,
              fontSize: 14,
              transition: `background-color ${duration}ms ${ease}, color ${duration}ms ${ease}`,
              '&:hover': {
                bgcolor: selected
                  ? theme.m3.primaryContainer
                  : alpha(theme.m3.onSurface, 0.08),
              },
            }}
          >
            {tab.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * 列表 / 网格布局切换（原版 _CollectLayoutSwitch）
 * 未选中 8 圆角、选中 24 圆角，200ms 形变
 * ------------------------------------------------------------------ */
interface KzLayoutSwitchProps {
  value: KzCollectLayout;
  onChange: (layout: KzCollectLayout) => void;
}

export const KzLayoutSwitch: React.FC<KzLayoutSwitchProps> = ({ value, onChange }) => {
  const theme = useTheme();
  const duration = theme.motion.durations.medium;
  const ease = theme.motion.easings.standard;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      {KZ_COLLECT_LAYOUTS.map((layout) => {
        const selected = value === layout;
        const radius = selected
          ? '24px'
          : layout === 'cards'
            ? '24px 8px 8px 24px'
            : '8px 24px 24px 8px';
        return (
          <Tooltip key={layout} title={layout === 'cards' ? '网格布局' : '列表布局'}>
            <IconButton
              aria-label={layout === 'cards' ? '网格布局' : '列表布局'}
              aria-pressed={selected}
              onClick={() => onChange(layout)}
              sx={{
                width: 48,
                height: 48,
                borderRadius: radius,
                bgcolor: selected ? theme.m3.secondaryContainer : theme.m3.surfaceContainerLow,
                color: selected ? theme.m3.onSecondaryContainer : theme.m3.onSurfaceVariant,
                transition: `border-radius ${duration}ms ${ease}, background-color ${duration}ms ${ease}, color ${duration}ms ${ease}`,
                '&:hover': {
                  bgcolor: selected ? theme.m3.secondaryContainer : theme.m3.surfaceContainer,
                },
              }}
            >
              {layout === 'cards' ? <Grid2x2 size={20} /> : <ListIcon size={20} />}
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * 搜索框（原版 SearchBar：surfaceContainerLow 底、无描边、48 高）
 * ------------------------------------------------------------------ */
interface KzSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const KzSearchBar: React.FC<KzSearchBarProps> = ({
  value,
  onChange,
  placeholder = '搜索收藏番剧',
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: 48,
        px: '16px',
        borderRadius: '12px',
        bgcolor: theme.m3.surfaceContainerLow,
        transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', color: theme.m3.onSurfaceVariant }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </Box>
      <Box
        component="input"
        value={value}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        sx={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          bgcolor: 'transparent',
          color: theme.m3.onSurface,
          font: 'inherit',
          fontSize: 14,
          '&::placeholder': { color: theme.m3.onSurfaceVariant, opacity: 1 },
        }}
      />
      {value !== '' && (
        <IconButton
          size="small"
          aria-label="清除搜索"
          onClick={() => onChange('')}
          sx={{ width: 32, height: 32, color: theme.m3.onSurfaceVariant }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </IconButton>
      )}
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * 状态切换菜单（列表项胶囊按钮 / 网格项 3 点菜单）
 * ------------------------------------------------------------------ */
interface KzStatusMenuProps {
  item: CollectRecord;
  /** 列表视图显示当前状态胶囊；网格视图显示 more_horiz 图标按钮 */
  variant?: 'label' | 'icon';
  onChangeStatus: (item: CollectRecord, status: number) => void;
  /** 打开后右侧是否附加标题提示 */
  title?: string;
}

export const KzStatusMenu: React.FC<KzStatusMenuProps> = ({
  item,
  variant = 'label',
  onChangeStatus,
  title,
}) => {
  const theme = useTheme();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const duration = theme.motion.durations.fast;
  const ease = theme.motion.easings.standard;
  const status = item.status ?? 2;

  const open = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchor(event.currentTarget);
  };

  const stop = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Box onClick={stop} sx={{ display: 'inline-flex' }}>
      {variant === 'label' ? (
        <ButtonBase
          onClick={open}
          aria-label={`调整《${item.bangumiName}》的观看状态`}
          sx={{
            height: 40,
            pl: '16px',
            pr: '12px',
            gap: '4px',
            borderRadius: '9999px',
            bgcolor: theme.m3.secondaryContainer,
            color: theme.m3.onSecondaryContainer,
            fontSize: 14,
            fontWeight: 500,
            transition: `background-color ${duration}ms ${ease}`,
            '&:hover': { bgcolor: theme.m3.secondaryContainer },
          }}
        >
          {kzStatusLabel(status)}
          <ChevronDown size={18} />
        </ButtonBase>
      ) : (
        <IconButton
          onClick={open}
          aria-label={title ? `管理《${title}》` : `管理《${item.bangumiName}》`}
          sx={{
            width: 40,
            height: 40,
            color: theme.m3.onSurfaceVariant,
            bgcolor: theme.m3.surfaceContainerLow,
            transition: `background-color ${duration}ms ${ease}`,
          }}
        >
          <Box component="span" sx={{ display: 'inline-flex', gap: '2px' }}>
            <Box component="span" sx={{ width: 3.5, height: 3.5, borderRadius: '50%', bgcolor: 'currentColor' }} />
            <Box component="span" sx={{ width: 3.5, height: 3.5, borderRadius: '50%', bgcolor: 'currentColor' }} />
            <Box component="span" sx={{ width: 3.5, height: 3.5, borderRadius: '50%', bgcolor: 'currentColor' }} />
          </Box>
        </IconButton>
      )}

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={stop}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {KZ_STATUS_TABS.filter((tab) => tab.id !== 0).map((tab) => (
          <MenuItem
            key={tab.id}
            selected={tab.id === status}
            onClick={() => {
              setAnchor(null);
              if (tab.id !== status) onChangeStatus(item, tab.id);
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <Box sx={{ width: 18, display: 'inline-flex' }}>
                {tab.id === status && <CheckIcon size={18} />}
              </Box>
              {tab.label}
            </Box>
          </MenuItem>
        ))}
        <Divider sx={{ my: '8px' }} />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onChangeStatus(item, 0);
          }}
          sx={{ color: theme.m3.error }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <Box sx={{ width: 18 }} />
            移除追番
          </Box>
        </MenuItem>
      </Menu>
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * 封面：AutoFadeImage + 容器 overflow hidden 裁切
 * ------------------------------------------------------------------ */
interface KzCoverProps {
  src?: string;
  alt: string;
  width: number | string;
  height?: number | string;
  ratio?: number;
  radius?: number | string;
}

export const KzCover: React.FC<KzCoverProps> = ({
  src,
  alt,
  width,
  height,
  ratio,
  radius = 12,
}) => {
  const theme = useTheme();
  const placeholder =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="168"><rect width="120" height="168" fill="${theme.m3.surfaceContainerHighest}"/></svg>`,
    );

  return (
    <Box
      sx={{
        width,
        height,
        pt: height === undefined ? `${100 / (ratio ?? 0.65)}%` : undefined,
        position: 'relative',
        flexShrink: 0,
        borderRadius: typeof radius === 'number' ? `${radius}px` : radius,
        overflow: 'hidden',
        bgcolor: theme.m3.surfaceContainerHighest,
      }}
    >
      <AutoFadeImage
        src={src || placeholder}
        alt={alt}
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
  );
};

/* ------------------------------------------------------------------ *
 * 列表项（原版 _CollectListTile：surfaceContainerLow、圆角 12、内边距 12/16）
 * ------------------------------------------------------------------ */
interface KzCollectListTileProps {
  item: CollectRecord;
  onOpen: (item: CollectRecord) => void;
  onChangeStatus: (item: CollectRecord, status: number) => void;
  entering: boolean;
  exiting: boolean;
}

export const KzCollectListTile: React.FC<KzCollectListTileProps> = ({
  item,
  onOpen,
  onChangeStatus,
  entering,
  exiting,
}) => {
  const theme = useTheme();
  const animation = exiting ? 'kzItemOut' : entering ? 'kzItemIn' : undefined;

  return (
    <Card
      elevation={0}
      sx={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        animation: animation
          ? `${animation} ${theme.motion.durations.fast}ms ${theme.motion.easings.standard} both`
          : undefined,
        '@keyframes kzItemIn': {
          from: { opacity: 0, transform: 'translateY(4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes kzItemOut': {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      }}
    >
      <CardActionArea
        onClick={() => onOpen(item)}
        aria-label={`查看《${item.bangumiName}》详情`}
        sx={{ display: 'block', p: '12px 16px 8px 12px', borderRadius: '12px' }}
      >
        <Box sx={{ pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <KzCover src={item.coverUrl} alt={item.bangumiName} width={80} height={120} radius={12} />

          <Box sx={{ flex: 1, minWidth: 0, pt: '4px', pb: '8px' }}>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 500,
                lineHeight: 1.35,
                color: theme.m3.onSurface,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                minHeight: 43,
              }}
            >
              {item.bangumiName}
            </Typography>
            {item.summary && (
              <Typography
                sx={{
                  mt: '8px',
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: theme.m3.onSurfaceVariant,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.summary}
              </Typography>
            )}
            <Box sx={{ mt: '8px', pointerEvents: 'auto', display: 'inline-flex' }}>
              <KzStatusMenu item={item} onChangeStatus={onChangeStatus} title={item.bangumiName} />
            </Box>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * 网格海报卡（原版 _CollectPosterCard：海报 0.65 + 标题 + 细信息 + 3 点菜单）
 * ------------------------------------------------------------------ */
interface KzCollectPosterCardProps {
  item: CollectRecord;
  /** 「全部」分类下才显示状态，对齐原版 showStatus: type == null */
  showStatus: boolean;
  onOpen: (item: CollectRecord) => void;
  onChangeStatus: (item: CollectRecord, status: number) => void;
  entering: boolean;
  exiting: boolean;
}

export const KzCollectPosterCard: React.FC<KzCollectPosterCardProps> = ({
  item,
  showStatus,
  onOpen,
  onChangeStatus,
  entering,
  exiting,
}) => {
  const theme = useTheme();
  const animation = exiting ? 'kzCardOut' : entering ? 'kzCardIn' : undefined;

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: animation
          ? `${animation} ${theme.motion.durations.fast}ms ${theme.motion.easings.standard} both`
          : undefined,
        '@keyframes kzCardIn': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        '@keyframes kzCardOut': {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      }}
    >
      <CardActionArea
        onClick={() => onOpen(item)}
        aria-label={`查看《${item.bangumiName}》详情`}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', height: '100%' }}
      >
        <Box sx={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <KzCover src={item.coverUrl} alt={item.bangumiName} width="100%" ratio={0.65} radius={0} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px',
              p: '8px 0 8px 12px',
              minHeight: 52,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  color: theme.m3.onSurface,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.bangumiName}
              </Typography>
              {showStatus && (
                <Typography sx={{ mt: '4px', fontSize: 12, lineHeight: 1.4, color: theme.m3.onSurfaceVariant }}>
                  {kzStatusLabel(item.status)}
                </Typography>
              )}
            </Box>
            <Box sx={{ pointerEvents: 'auto', display: 'inline-flex' }}>
              <KzStatusMenu
                item={item}
                variant="icon"
                title={item.bangumiName}
                onChangeStatus={onChangeStatus}
              />
            </Box>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
};
