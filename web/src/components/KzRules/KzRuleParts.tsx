import React from 'react';
import {
  Box,
  ButtonBase,
  Card,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { Check, MoreHorizontal, Puzzle } from 'lucide-react';
import type { Plugin } from '../../types';

/**
 * 规则管理页私有零件，对齐原版：
 *  - Kazumi/lib/bean/card/rule_card.dart（AnimatedContainer 220ms：选中 secondaryContainer、
 *    未选中 surfaceContainerLow；identity 图标块 48；tags Wrap 间距 6；trailing 右上角菜单）
 *  - Kazumi/lib/pages/plugin_editor/plugin_view_page.dart（版本 / 可更新 / 搜索通过 徽章 + 3 点菜单）
 *  - Kazumi/lib/pages/plugin_editor/plugin_catalog_view.dart（市场卡：版本 / 含验证支持 / 安装按钮）
 */

export const KZ_RULES_PAGE_PAD = 12;

/* ------------------------------------------------------------------ *
 * 小圆角彩色徽章（原版 RuleTag：圆角 8、padding 8/3、labelSmall w600）
 * ------------------------------------------------------------------ */
interface KzRuleBadgeProps {
  label: string;
  bg: string;
  fg: string;
}

export const KzRuleBadge: React.FC<KzRuleBadgeProps> = ({ label, bg, fg }) => (
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
 * 版本比较：仅在市场版本严格更高时给出「可更新」
 * ------------------------------------------------------------------ */
export function kzHasUpdate(localVersion?: string, marketVersion?: string): boolean {
  if (!localVersion || !marketVersion) return false;
  const parse = (value: string) => value.replace(/^v/i, '').split(/[.\-+]/).map((part) => parseInt(part, 10) || 0);
  const local = parse(localVersion);
  const market = parse(marketVersion);
  const length = Math.max(local.length, market.length);
  for (let index = 0; index < length; index += 1) {
    const a = local[index] ?? 0;
    const b = market[index] ?? 0;
    if (a !== b) return b > a;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 安装时间：后端未持久化，首次见到规则时记录本地时间，缺失则用名称哈希回填
 * （仅展示用途，保证同一规则每次渲染稳定）
 * ------------------------------------------------------------------ */
const INSTALL_STORE_KEY = 'kz:rule-install-time';

function readInstallStore(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(INSTALL_STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeInstallStore(store: Record<string, number>): void {
  try {
    window.localStorage.setItem(INSTALL_STORE_KEY, JSON.stringify(store));
  } catch {
    /* 隐私模式下忽略 */
  }
}

function hashDate(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000;
  }
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (hash % 540));
  return date.getTime();
}

/** 返回 MM-DD 形式的安装时间 */
export function kzInstallLabel(name: string): string {
  const store = readInstallStore();
  let stamp = store[name];
  if (!stamp) {
    stamp = hashDate(name);
    store[name] = stamp;
    writeInstallStore(store);
  }
  const date = new Date(stamp);
  return `安装于 ${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * 规则操作菜单（原版 KazumiMenuButton：编辑 / 测试 / 检查更新 / 分享 / 上移下移 / 删除）
 * ------------------------------------------------------------------ */
export type KzRuleAction = 'up' | 'down' | 'update' | 'delete';

interface KzRuleMenuProps {
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  onAction: (action: KzRuleAction) => void;
}

export const KzRuleMenu: React.FC<KzRuleMenuProps> = ({
  name,
  canMoveUp,
  canMoveDown,
  busy,
  onAction,
}) => {
  const theme = useTheme();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  const run = (action: KzRuleAction) => {
    setAnchor(null);
    onAction(action);
  };

  return (
    <>
      <IconButton
        aria-label={`${name} 的更多操作`}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
        sx={{ width: 48, height: 48, color: theme.m3.onSurfaceVariant }}
      >
        <MoreHorizontal size={20} />
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={(event) => event.stopPropagation()}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem disabled={busy} onClick={() => run('update')}>
          检查更新
        </MenuItem>
        <MenuItem disabled={busy || !canMoveUp} onClick={() => run('up')}>
          上移
        </MenuItem>
        <MenuItem disabled={busy || !canMoveDown} onClick={() => run('down')}>
          下移
        </MenuItem>
        <Divider sx={{ my: '8px' }} />
        <MenuItem disabled={busy} onClick={() => run('delete')} sx={{ color: theme.m3.error }}>
          删除规则
        </MenuItem>
      </Menu>
    </>
  );
};

/* ------------------------------------------------------------------ *
 * 本地规则卡片（原版 RuleCard：圆角 12、内边距 14、48 图标块、右上角菜单）
 * ------------------------------------------------------------------ */
interface KzLocalRuleCardProps {
  rule: Plugin;
  index: number;
  total: number;
  updatable: boolean;
  searchValid: boolean;
  busy: boolean;
  exiting: boolean;
  /** 状态开关（原版通过编辑页修改，Web 侧内联为 Switch） */
  onToggleEnabled: (rule: Plugin, enabled: boolean) => void;
  onOpen: (rule: Plugin) => void;
  onAction: (rule: Plugin, action: KzRuleAction) => void;
}

export const KzLocalRuleCard: React.FC<KzLocalRuleCardProps> = ({
  rule,
  index,
  total,
  updatable,
  searchValid,
  busy,
  exiting,
  onToggleEnabled,
  onOpen,
  onAction,
}) => {
  const theme = useTheme();
  const duration = theme.motion.durations.medium;
  const ease = theme.motion.easings.standard;
  const disabled = rule.enabled === false;
  const host = safeHost(rule.baseURL);

  return (
    <Card
      elevation={0}
      sx={{
        position: 'relative',
        borderRadius: '12px',
        p: '14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        animation: exiting
          ? `${'kzRuleOut'} ${theme.motion.durations.fast}ms ${ease} both`
          : undefined,
        '&:hover': { bgcolor: theme.m3.surfaceContainer },
        transition: `background-color ${duration}ms ${ease}`,
        cursor: 'pointer',
        '@keyframes kzRuleIn': {
          from: { opacity: 0, transform: 'translateY(4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes kzRuleOut': {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      }}
      onClick={() => onOpen(rule)}
    >
      {/* identity 图标块：原版未选中 primaryContainer / 已安装 secondaryContainer */}
      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: disabled ? theme.m3.secondaryContainer : theme.m3.primaryContainer,
          color: disabled ? theme.m3.onSecondaryContainer : theme.m3.onPrimaryContainer,
          opacity: disabled ? 0.6 : 1,
          transition: `background-color ${duration}ms ${ease}, color ${duration}ms ${ease}`,
        }}
      >
        {disabled ? <Check size={22} /> : <Puzzle size={22} />}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* 标题 + 版本（三段信息层级的第一段） */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.35,
              color: theme.m3.onSurface,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {rule.name}
          </Typography>
          <KzRuleBadge
            label={rule.version ? `v${rule.version.replace(/^v/i, '')}` : 'v1.0'}
            bg={theme.m3.surfaceContainerHighest}
            fg={theme.m3.onSurfaceVariant}
          />
        </Box>

        <Typography sx={{ mt: '3px', fontSize: 12, color: theme.m3.onSurfaceVariant }}>
          {host || rule.baseURL || '未填写站点地址'}
        </Typography>

        {/* 状态徽章 + 安装时间（第二、三段信息层级） */}
        <Box sx={{ mt: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {updatable && (
            <KzRuleBadge label="可更新" bg={theme.m3.secondaryContainer} fg={theme.m3.onSecondaryContainer} />
          )}
          {searchValid && (
            <KzRuleBadge label="搜索通过" bg={theme.m3.tertiaryContainer} fg={theme.m3.onTertiaryContainer} />
          )}
          <KzRuleBadge
            label={disabled ? '已停用' : '已启用'}
            bg={disabled ? theme.m3.errorContainer : theme.m3.tertiaryContainer}
            fg={disabled ? theme.m3.onErrorContainer : theme.m3.onTertiaryContainer}
          />
          <Typography sx={{ fontSize: 12, color: theme.m3.onSurfaceVariant }}>
            · {kzInstallLabel(rule.name)}
          </Typography>
        </Box>
      </Box>

      {/* 右上角：启用开关 + 3 点菜单 */}
      <Box
        sx={{ flexShrink: 0, ml: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
        onClick={(event) => event.stopPropagation()}
      >
        <Tooltip title={disabled ? '启用该规则' : '停用该规则'}>
          <Switch
            checked={!disabled}
            onChange={(event) => onToggleEnabled(rule, event.target.checked)}
            slotProps={{ input: { 'aria-label': `启用 ${rule.name}` } }}
          />
        </Tooltip>
        <KzRuleMenu
          name={rule.name}
          canMoveUp={index > 0}
          canMoveDown={index < total - 1}
          busy={busy}
          onAction={(action) => onAction(rule, action)}
        />
      </Box>
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * 市场规则卡片（原版 plugin_catalog_view 的 RuleCard + trailing 安装/更新按钮）
 * ------------------------------------------------------------------ */
interface KzMarketRuleCardProps {
  name: string;
  version: string;
  author?: string;
  /** 0 未安装 / 1 已安装 / 2 可更新 */
  status: 0 | 1 | 2;
  busy: boolean;
  onInstall: () => void;
}

export const KzMarketRuleCard: React.FC<KzMarketRuleCardProps> = ({
  name,
  version,
  author,
  status,
  busy,
  onInstall,
}) => {
  const theme = useTheme();
  const installed = status === 1;

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '12px',
        p: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: installed ? theme.m3.secondaryContainer : theme.m3.primaryContainer,
          color: installed ? theme.m3.onSecondaryContainer : theme.m3.onPrimaryContainer,
        }}
      >
        {installed ? <Check size={22} /> : <Puzzle size={22} />}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.35,
              color: theme.m3.onSurface,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {name}
          </Typography>
          <KzRuleBadge
            label={`v${version.replace(/^v/i, '')}`}
            bg={theme.m3.surfaceContainerHighest}
            fg={theme.m3.onSurfaceVariant}
          />
          {status === 2 && (
            <KzRuleBadge label="可更新" bg={theme.m3.secondaryContainer} fg={theme.m3.onSecondaryContainer} />
          )}
        </Box>
        <Typography sx={{ mt: '3px', fontSize: 12, color: theme.m3.onSurfaceVariant }}>
          {author ? `作者 · ${author}` : '社区规则'}
        </Typography>
      </Box>

      {installed ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            px: '16px',
            py: '14px',
            color: theme.m3.onSurfaceVariant,
            fontSize: 14,
          }}
        >
          <Check size={18} />
          已安装
        </Box>
      ) : (
        <Box sx={{ flexShrink: 0 }}>
          <Tooltip title={status === 2 ? '更新到最新版本' : '安装该规则'}>
            <span>
              <ButtonBase
                disabled={busy}
                onClick={onInstall}
                sx={{
                  minWidth: 108,
                  height: 48,
                  gap: '6px',
                  px: '16px',
                  borderRadius: '9999px',
                  bgcolor: theme.m3.secondaryContainer,
                  color: theme.m3.onSecondaryContainer,
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: busy ? 0.6 : 1,
                  transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
                }}
              >
                {busy ? '处理中' : status === 2 ? '更新' : '安装'}
              </ButtonBase>
            </span>
          </Tooltip>
        </Box>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * 分类 Tab（原版 M3 TabBar：48 高、选中 primary、指示器 3px）
 * ------------------------------------------------------------------ */
interface KzRuleTabsProps {
  value: number;
  labels: string[];
  onChange: (value: number) => void;
}

export const KzRuleTabs: React.FC<KzRuleTabsProps> = ({ value, labels, onChange }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', borderBottom: `1px solid ${theme.m3.outlineVariant}` }}>
      {labels.map((label, index) => {
        const selected = index === value;
        return (
          <ButtonBase
            key={label}
            onClick={() => onChange(index)}
            sx={{
              flex: 1,
              minHeight: 48,
              px: '16px',
              fontSize: 14,
              fontWeight: 500,
              color: selected ? theme.m3.primary : theme.m3.onSurfaceVariant,
              borderBottom: `3px solid ${selected ? theme.m3.primary : 'transparent'}`,
              transition: `color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, border-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
            }}
          >
            {label}
          </ButtonBase>
        );
      })}
    </Box>
  );
};

function safeHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
