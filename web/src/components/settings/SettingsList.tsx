import React from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Divider,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Slider,
  Switch,
  Typography,
  useTheme,
} from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * 设置列表组件：原版 `Kazumi/lib/bean/settings/settings_list.dart` 的 MUI 对应实现。
 *
 *  - SettingsSection      ← SettingsSection（分组标题 + 条目 + 底部说明）
 *  - SettingsTile         ← SettingsTile（ListItemButton + 左侧图标 + ListItemText + 右侧值/箭头）
 *  - SettingsSwitchTile   ← SettingsTile.switchTile
 *  - SettingsSliderTile   ← SettingsSliderTile（标题 + secondaryContainer 数值胶囊 + Slider）
 *  - SettingsDropdownTile ← SettingsDropdownTile（整行可点，弹出 M3 菜单）
 *  - SettingsCategoryTile ← SettingsCategoryTile（36px 圆形图标 + 标题 + 描述 + chevron）
 *
 * 形状 / 间距 / 颜色依据 Web/UI-SPEC.md：
 *  - 卡片与条目圆角 12（theme.shape.borderRadius），无描边、无投影、无 hover 位移；
 *  - 条目间距 8；分组标题为 onSurfaceVariant 小字；分割线取 outlineVariant；
 *  - 所有颜色取自 `theme.m3`，不硬编码（配色方案的种子色除外，见 SettingsPage）。
 */

const rowSx = (theme: Theme) => ({
  borderRadius: `${theme.shape.borderRadius}px`,
  backgroundColor: theme.m3.surfaceContainerLow,
  transition: `background-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
});

/** 分组标题：原版 SectionHeader —— 小字灰标题（subtitle2 / onSurfaceVariant） */
export const SectionHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
}> = ({ title, description }) => {
  const theme = useTheme();
  return (
    <Box sx={{ px: 2, mb: 1 }}>
      <Typography
        variant="subtitle2"
        component="h3"
        sx={{ color: theme.m3.onSurfaceVariant, fontWeight: 500, fontSize: 14, lineHeight: '20px' }}
      >
        {title}
      </Typography>
      {description != null && (
        <Typography
          variant="caption"
          component="p"
          sx={{ display: 'block', mt: 0.5, color: theme.m3.onSurfaceVariant }}
        >
          {description}
        </Typography>
      )}
    </Box>
  );
};

/** 分割线：统一取 outlineVariant */
export const SettingsDivider: React.FC<{ inset?: boolean }> = ({ inset = false }) => {
  const theme = useTheme();
  return (
    <Divider
      sx={{
        borderColor: theme.m3.outlineVariant,
        ml: inset ? 2 : 0,
        mr: inset ? 2 : 0,
      }}
    />
  );
};

/** 设置分组：标题 + 条目（间距 8）+ 可选底部说明 */
export const SettingsSection: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  bottomInfo?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, bottomInfo, children }) => {
  const theme = useTheme();
  return (
    <Box component="section" sx={{ mb: 3 }}>
      {title != null && <SectionHeader title={title} description={description} />}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
      {bottomInfo != null && (
        <Typography
          variant="caption"
          component="p"
          sx={{ display: 'block', px: 2, mt: 1, color: theme.m3.onSurfaceVariant, lineHeight: 1.6 }}
        >
          {bottomInfo}
        </Typography>
      )}
    </Box>
  );
};

export interface SettingsTileProps {
  title: React.ReactNode;
  leading?: React.ReactNode;
  description?: React.ReactNode;
  /** 右侧数值（原版 SettingsTile.value） */
  value?: React.ReactNode;
  /** 右侧控件（箭头 / 开关等） */
  trailing?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
}

/** 普通设置条目：整行 ListItemButton（自带 12 圆角、波纹与 secondaryContainer 选中态） */
export const SettingsTile: React.FC<SettingsTileProps> = ({
  title,
  leading,
  description,
  value,
  trailing,
  onClick,
  disabled = false,
}) => {
  const theme = useTheme();
  return (
    <ListItemButton
      disabled={disabled}
      onClick={onClick}
      sx={{
        ...rowSx(theme),
        px: 2,
        py: 1.25,
        minHeight: 56,
        '&.Mui-disabled': { opacity: 0.38 },
      }}
    >
      {leading != null && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            mr: 2,
            flexShrink: 0,
            color: theme.m3.onSurfaceVariant,
          }}
        >
          {leading}
        </Box>
      )}
      <ListItemText
        primary={title}
        secondary={description}
        slotProps={{
          primary: { sx: { color: theme.m3.onSurface, fontSize: 16, lineHeight: '24px' } },
          secondary: {
            sx: { color: theme.m3.onSurfaceVariant, fontSize: 12, lineHeight: '16px', mt: 0.25 },
          },
        }}
      />
      {value != null && (
        <Typography
          variant="body2"
          component="span"
          sx={{
            ml: 1.5,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            color: theme.m3.onSurfaceVariant,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </Typography>
      )}
      {trailing != null && (
        <Box
          sx={{
            ml: 1,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            color: theme.m3.onSurfaceVariant,
          }}
        >
          {trailing}
        </Box>
      )}
    </ListItemButton>
  );
};

/** 开关条目：原版 SettingsTile.switchTile —— 点整行与点开关都会切换 */
export const SettingsSwitchTile: React.FC<
  Omit<SettingsTileProps, 'value' | 'trailing' | 'onClick'> & {
    checked: boolean;
    onToggle: (checked: boolean) => void;
  }
> = ({ checked, onToggle, ...rest }) => (
  <SettingsTile
    {...rest}
    onClick={() => onToggle(!checked)}
    trailing={
      // 阻止冒泡，避免开关与整行各触发一次
      <Box sx={{ display: 'flex' }} onClick={(event) => event.stopPropagation()}>
        <Switch checked={checked} onChange={(_, next) => onToggle(next)} />
      </Box>
    }
  />
);

export interface SettingsSliderTileProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  value: number;
  /** 右侧数值文案（原版 valueLabel，等宽数字） */
  valueLabel: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

/** 滑块条目：排版对齐原版 SettingsSliderTile（标题 + secondaryContainer 数值胶囊 + Slider） */
export const SettingsSliderTile: React.FC<SettingsSliderTileProps> = ({
  title,
  description,
  leading,
  value,
  valueLabel,
  min,
  max,
  step,
  onChange,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ ...rowSx(theme), px: 2, py: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {leading != null && (
          <Box sx={{ display: 'flex', flexShrink: 0, color: theme.m3.onSurfaceVariant }}>{leading}</Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body1"
            component="p"
            sx={{ color: theme.m3.onSurface, fontSize: 16, lineHeight: '24px' }}
          >
            {title}
          </Typography>
          {description != null && (
            <Typography
              variant="caption"
              component="p"
              sx={{ display: 'block', mt: 0.25, color: theme.m3.onSurfaceVariant }}
            >
              {description}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            px: 1.25,
            py: 0.5,
            flexShrink: 0,
            borderRadius: '8px',
            whiteSpace: 'nowrap',
            backgroundColor: theme.m3.secondaryContainer,
            color: theme.m3.onSecondaryContainer,
          }}
        >
          <Typography
            variant="caption"
            component="span"
            sx={{
              fontSize: 12,
              lineHeight: '16px',
              letterSpacing: '0.5px',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {valueLabel}
          </Typography>
        </Box>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        valueLabelDisplay="off"
        onChange={(_, next) => onChange(next as number)}
        sx={{ mt: 1, mb: 0 }}
      />
    </Box>
  );
};

export interface SettingsDropdownOption<T> {
  value: T;
  label: string;
}

/** 下拉条目：原版 SettingsDropdownTile —— 整行点开 M3 菜单（4 圆角、surfaceContainer） */
export function SettingsDropdownTile<T extends string | number>({
  title,
  description,
  leading,
  value,
  options,
  onChange,
  fallbackLabel = '',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  value: T;
  options: SettingsDropdownOption<T>[];
  onChange: (value: T) => void;
  fallbackLabel?: string;
}) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const current = options.find((option) => option.value === value);

  return (
    <>
      <SettingsTile
        title={title}
        description={description}
        leading={leading}
        value={current ? current.label : fallbackLabel}
        trailing={<ChevronDown size={20} />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      />
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        transitionDuration={theme.motion.durations.medium}
      >
        {options.map((option) => (
          <MenuItem
            key={String(option.value)}
            selected={option.value === value}
            onClick={() => {
              setAnchorEl(null);
              onChange(option.value);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** 分类条目：原版 SettingsCategoryTile —— 36px 圆形 secondaryContainer 图标 + 标题 + 描述 + chevron */
export const SettingsCategoryTile: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClick: () => void;
}> = ({ icon, title, description, onClick }) => {
  const theme = useTheme();
  return (
    <ListItemButton onClick={onClick} sx={{ ...rowSx(theme), px: 2, py: 1.5, minHeight: 64 }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          mr: 2,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          backgroundColor: theme.m3.secondaryContainer,
          color: theme.m3.onSecondaryContainer,
        }}
      >
        {icon}
      </Box>
      <ListItemText
        primary={title}
        secondary={description}
        slotProps={{
          primary: { sx: { color: theme.m3.onSurface, fontSize: 16, lineHeight: '24px' } },
          secondary: {
            sx: { color: theme.m3.onSurfaceVariant, fontSize: 12, lineHeight: '16px', mt: 0.25 },
          },
        }}
      />
      <ChevronRight size={20} color={theme.m3.onSurfaceVariant} />
    </ListItemButton>
  );
};
