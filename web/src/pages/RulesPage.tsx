import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { apiService } from '../api/client';
import { cached, peek } from '../data/requestCache';
import {
  KZ_RULES_PAGE_PAD,
  KzLocalRuleCard,
  KzMarketRuleCard,
  KzRuleTabs,
  kzHasUpdate,
  type KzRuleAction,
} from '../components/KzRules/KzRuleParts';
import type { Plugin } from '../types';

/**
 * 规则管理页 —— 对照原版：
 *  - Kazumi/lib/pages/plugin_editor/plugin_view_page.dart（我的规则：搜索 / 可更新筛选 / 更新全部 /
 *    版本 · 可更新 · 搜索通过 徽章 / 3 点菜单 编辑·测试·检查更新·上移下移·删除）
 *  - Kazumi/lib/pages/plugin_editor/plugin_catalog_view.dart（规则仓库：安装 / 更新、含验证支持徽章）
 *  - Kazumi/lib/bean/card/rule_card.dart（12 圆角、无描边、48 图标块、tags 间距 6）
 *
 * 连续性：`peek('rules:local' | 'rules:market')` 命中缓存直接渲染；增删改后 invalidate 再取。
 */

const LOCAL_KEY = 'rules:local';
const MARKET_KEY = 'rules:market';
const EXIT_MS = 150;

type MarketRule = { name: string; version: string; type: string; author?: string };

export const RulesPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [localRules, setLocalRules] = useState<Plugin[]>(() => peek<Plugin[]>(LOCAL_KEY) ?? []);
  const [marketRules, setMarketRules] = useState<MarketRule[]>(
    () => peek<MarketRule[]>(MARKET_KEY) ?? [],
  );
  const [loading, setLoading] = useState(
    () => peek<Plugin[]>(LOCAL_KEY) === undefined || peek<MarketRule[]>(MARKET_KEY) === undefined,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [installing, setInstalling] = useState<string[]>([]);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [exiting, setExiting] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const later = useCallback((fn: () => void, delay: number) => {
    const timer = window.setTimeout(fn, delay);
    timers.current.push(timer);
  }, []);

  /* ------------------------------ 数据加载 ------------------------------ */
  const loadData = useCallback(async (force = false) => {
    if (peek<Plugin[]>(LOCAL_KEY) === undefined) setLoading(true);
    try {
      const [locals, market] = force
        ? await Promise.all([apiService.getRules(), apiService.getMarketRules()])
        : await Promise.all([
            cached(LOCAL_KEY, () => apiService.getRules()),
            cached(MARKET_KEY, () => apiService.getMarketRules()),
          ]);
      setLocalRules(locals ?? []);
      setMarketRules((market as MarketRule[]) ?? []);
    } catch (err) {
      console.error('加载规则失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  /* --------------------------- 派生：更新 / 过滤 --------------------------- */
  const marketByName = useMemo(() => {
    const map = new Map<string, MarketRule>();
    marketRules.forEach((rule) => map.set(rule.name, rule));
    return map;
  }, [marketRules]);

  const updatableNames = useMemo(
    () =>
      localRules
        .filter((rule) => kzHasUpdate(rule.version, marketByName.get(rule.name)?.version))
        .map((rule) => rule.name),
    [localRules, marketByName],
  );

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return localRules.filter((rule) => {
      const matchQuery =
        !keyword ||
        rule.name.toLowerCase().includes(keyword) ||
        (rule.baseURL ?? '').toLowerCase().includes(keyword);
      const matchUpdates = !updatesOnly || updatableNames.includes(rule.name);
      return matchQuery && matchUpdates;
    });
  }, [localRules, query, updatesOnly, updatableNames]);

  /* ------------------------------ 变更操作 ------------------------------ */
  const toggleEnabled = async (rule: Plugin, enabled: boolean) => {
    if (!rule.id) return;
    setLocalRules((prev) =>
      prev.map((row) => (row.id === rule.id ? { ...row, enabled } : row)),
    );
    try {
      await apiService.toggleRule(rule.id, enabled);
    } catch (err) {
      console.error('切换规则状态失败:', err);
      setToast('切换规则状态失败，请重试');
    }
    void loadData(true);
  };

  const installMarket = async (name: string) => {
    if (installing.includes(name)) return;
    setInstalling((prev) => [...prev, name]);
    try {
      await apiService.installMarketRule(name);
      setToast(`规则「${name}」安装成功`);
      await loadData(true);
    } catch (err) {
      console.error('安装规则失败:', err);
      setToast(`安装失败：${(err as Error).message || '请稍后重试'}`);
    } finally {
      setInstalling((prev) => prev.filter((row) => row !== name));
    }
  };

  const updateAll = async () => {
    if (updatingAll || updatableNames.length === 0) return;
    setUpdatingAll(true);
    for (const name of updatableNames) {
      try {
        await apiService.installMarketRule(name);
      } catch (err) {
        console.error(`更新规则 ${name} 失败:`, err);
      }
    }
    await loadData(true);
    setUpdatingAll(false);
    setToast('规则更新完成');
  };

  /** 删除：先淡出再落库（原版 confirmRuleDeletion） */
  const confirmDelete = (names: string[]) => {
    if (names.length === 0) return;
    setDeleteTarget(names);
  };

  const runDelete = async () => {
    const names = deleteTarget ?? [];
    setDeleteTarget(null);
    setExiting(names);
    later(async () => {
      for (const name of names) {
        const rule = localRules.find((row) => row.name === name);
        if (!rule?.id) continue;
        try {
          await apiService.deleteRule(rule.id);
        } catch (err) {
          console.error(`删除规则 ${name} 失败:`, err);
        }
      }
      setExiting([]);
      setSelecting(false);
      setSelected([]);
      await loadData(true);
      setToast(`已删除 ${names.length} 条规则`);
    }, EXIT_MS);
  };

  const move = async (rule: Plugin, direction: -1 | 1) => {
    const index = localRules.findIndex((row) => row.name === rule.name);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= localRules.length) return;
    const next = [...localRules];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setLocalRules(next);
  };

  const handleAction = (rule: Plugin, action: KzRuleAction) => {
    switch (action) {
      case 'update': {
        const market = marketByName.get(rule.name);
        if (market && kzHasUpdate(rule.version, market.version)) void installMarket(rule.name);
        else setToast(market ? '规则已是最新' : '规则仓库中没有当前规则');
        break;
      }
      case 'up':
        void move(rule, -1);
        break;
      case 'down':
        void move(rule, 1);
        break;
      case 'delete':
        confirmDelete([rule.name]);
        break;
      default:
        break;
    }
  };

  const importRule = async () => {
    try {
      const parsed = JSON.parse(importJson) as Plugin;
      await apiService.saveRule(parsed);
      setImportOpen(false);
      setImportJson('');
      await loadData(true);
      setToast('规则导入成功');
    } catch {
      setToast('规则 JSON 格式不合法');
    }
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((row) => row !== name) : [...prev, name]));
  };

  /* --------------------------------- 渲染 --------------------------------- */
  return (
    <Box sx={{ width: '100%', pb: 6 }}>
      {/* 顶栏（原版 SettingsDetailScaffold：返回 / 标题 / 批量选择 / 删除） */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          minHeight: 72,
          px: `${KZ_RULES_PAGE_PAD}px`,
          bgcolor: theme.m3.surface,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <IconButton
          onClick={() => (selecting ? (setSelecting(false), setSelected([])) : navigate(-1))}
          aria-label={selecting ? '退出多选' : '返回'}
          sx={{ color: theme.m3.onSurface, ml: '-8px' }}
        >
          <ArrowLeft size={22} />
        </IconButton>

        <Typography
          sx={{
            flex: 1,
            fontSize: { xs: 20, sm: 24 },
            fontWeight: 500,
            lineHeight: '32px',
            color: theme.m3.onSurface,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selecting ? `已选择 ${selected.length} 条` : '规则管理'}
        </Typography>

        {selecting ? (
          <Tooltip title="删除所选规则">
            <span>
              <IconButton
                onClick={() => confirmDelete(selected)}
                disabled={selected.length === 0}
                aria-label="删除所选规则"
                sx={{ color: theme.m3.error }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                </svg>
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title="批量选择">
            <IconButton
              onClick={() => setSelecting(true)}
              aria-label="批量选择"
              sx={{ color: theme.m3.onSurfaceVariant }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ px: `${KZ_RULES_PAGE_PAD}px`, maxWidth: 1000 + KZ_RULES_PAGE_PAD * 2, mx: 'auto' }}>
        <KzRuleTabs
          value={tab}
          labels={[`本地规则 (${localRules.length})`, `规则市场 (${marketRules.length})`]}
          onChange={(value) => setTab(value)}
        />

        <Box sx={{ height: 16 }} />

        {tab === 0 ? (
          <>
            {/* 搜索 + 可更新筛选 + 更新全部（原版 plugin_view_page 头部） */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  minHeight: 56,
                  px: '20px',
                  borderRadius: '16px',
                  bgcolor: theme.m3.surfaceContainerHighest,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.m3.onSurfaceVariant} strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <Box
                  component="input"
                  value={query}
                  placeholder="搜索名称或站点"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
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
                {query !== '' && (
                  <IconButton size="small" aria-label="清除搜索" onClick={() => setQuery('')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </IconButton>
                )}
              </Box>

              <Tooltip title="刷新规则列表">
                <span>
                  <IconButton
                    onClick={refresh}
                    disabled={refreshing || loading}
                    aria-label="刷新规则列表"
                    sx={{
                      width: 48,
                      height: 48,
                      bgcolor: theme.m3.secondaryContainer,
                      color: theme.m3.onSecondaryContainer,
                      '&:hover': { bgcolor: theme.m3.secondaryContainer },
                    }}
                  >
                    <RefreshCw
                      size={20}
                      style={refreshing ? { animation: 'kzRuleSpin 1s linear infinite' } : undefined}
                    />
                  </IconButton>
                </span>
              </Tooltip>

              <Button
                onClick={() => setImportOpen(true)}
                startIcon={<Plus size={18} />}
                sx={{
                  bgcolor: theme.m3.primaryContainer,
                  color: theme.m3.onPrimaryContainer,
                  '&:hover': { bgcolor: theme.m3.primaryContainer },
                }}
              >
                导入
              </Button>
            </Box>

            <Box sx={{ mt: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <FilterPill
                label={`全部 ${localRules.length}`}
                selected={!updatesOnly}
                onClick={() => setUpdatesOnly(false)}
              />
              <FilterPill
                label={`可更新 ${updatableNames.length}`}
                selected={updatesOnly}
                onClick={() => setUpdatesOnly(true)}
              />
              <Button
                onClick={updateAll}
                disabled={updatingAll || updatableNames.length === 0}
                startIcon={<RefreshCw size={18} />}
                sx={{ color: theme.m3.primary }}
              >
                {updatingAll ? '正在更新' : '更新全部'}
              </Button>
              {selecting && (
                <Button
                  onClick={() =>
                    setSelected(
                      visible.every((rule) => selected.includes(rule.name))
                        ? selected.filter((name) => !visible.some((rule) => rule.name === name))
                        : [...new Set([...selected, ...visible.map((rule) => rule.name)])],
                    )
                  }
                  sx={{ color: theme.m3.primary }}
                >
                  {visible.length > 0 && visible.every((rule) => selected.includes(rule.name))
                    ? '取消全选'
                    : '全选当前列表'}
                </Button>
              )}
            </Box>

            <Box sx={{ height: 12 }} />

            {/* 本地规则列表 */}
            {loading && localRules.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} variant="rounded" height={110} />
                ))}
              </Box>
            ) : visible.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>
                  {localRules.length === 0
                    ? '还没有安装规则'
                    : updatesOnly && !query.trim()
                      ? '没有可更新的规则'
                      : '没有符合条件的规则'}
                </Typography>
                {localRules.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Button
                      onClick={() => {
                        setQuery('');
                        setUpdatesOnly(false);
                      }}
                      sx={{
                        bgcolor: theme.m3.secondaryContainer,
                        color: theme.m3.onSecondaryContainer,
                        '&:hover': { bgcolor: theme.m3.secondaryContainer },
                      }}
                    >
                      显示全部规则
                    </Button>
                  </Box>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visible.map((rule, index) => (
                  <Box key={rule.id ?? rule.name} sx={{ position: 'relative' }}>
                    {selecting && (
                      <Box
                        role="checkbox"
                        aria-checked={selected.includes(rule.name)}
                        aria-label={`选择 ${rule.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSelect(rule.name);
                        }}
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 2,
                          borderRadius: '12px',
                          cursor: 'pointer',
                          bgcolor: selected.includes(rule.name)
                            ? alpha(theme.m3.secondaryContainer, 0.35)
                            : 'transparent',
                          transition: `background-color ${theme.motion.durations.fast}ms ${theme.motion.easings.standard}`,
                        }}
                      />
                    )}
                    <KzLocalRuleCard
                      rule={rule}
                      index={index}
                      total={visible.length}
                      updatable={updatableNames.includes(rule.name)}
                      searchValid={false}
                      busy={installing.includes(rule.name)}
                      exiting={exiting.includes(rule.name)}
                      onToggleEnabled={toggleEnabled}
                      onOpen={() => setToast('Web 版暂不支持编辑规则，可导入 JSON 覆盖')}
                      onAction={handleAction}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </>
        ) : (
          /* 规则市场（原版 plugin_catalog_view） */
          <>
            {loading && marketRules.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} variant="rounded" height={96} />
                ))}
              </Box>
            ) : marketRules.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>
                  仓库暂无规则
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {marketRules.map((rule) => {
                  const local = localRules.find((row) => row.name === rule.name);
                  const status: 0 | 1 | 2 = !local
                    ? 0
                    : kzHasUpdate(local.version, rule.version)
                      ? 2
                      : 1;
                  return (
                    <KzMarketRuleCard
                      key={rule.name}
                      name={rule.name}
                      version={rule.version}
                      author={rule.author}
                      status={status}
                      busy={installing.includes(rule.name)}
                      onInstall={() => void installMarket(rule.name)}
                    />
                  );
                })}
              </Box>
            )}
          </>
        )}
      </Box>

      {/* 轻提示（替代原版 KazumiDialog.showToast） */}
      {toast && (
        <Box
          role="status"
          sx={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            zIndex: 1400,
            px: '16px',
            py: '10px',
            borderRadius: '8px',
            bgcolor: theme.m3.surfaceContainerHighest,
            color: theme.m3.onSurface,
            fontSize: 14,
            animation: `kzToastIn ${theme.motion.durations.fast}ms ${theme.motion.easings.standard} both`,
            '@keyframes kzToastIn': {
              from: { opacity: 0, transform: 'translate(-50%, 8px)' },
              to: { opacity: 1, transform: 'translate(-50%, 0)' },
            },
          }}
        >
          {toast}
        </Box>
      )}

      {/* 导入 JSON（原版 showRuleImportDialog） */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>导入自定义规则 JSON</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            rows={8}
            fullWidth
            placeholder="粘贴完整的 Kazumi 规则 JSON 内容…"
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setImportOpen(false)}>取消</Button>
          <Button
            onClick={importRule}
            sx={{
              bgcolor: theme.m3.primary,
              color: theme.m3.onPrimary,
              '&:hover': { bgcolor: theme.m3.primary },
            }}
          >
            确认导入
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认（原版 confirmRuleDeletion） */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>删除规则？</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: theme.m3.onSurfaceVariant }}>
            将删除 {(deleteTarget ?? []).length} 条规则：{(deleteTarget ?? []).join('、')}。此操作无法撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button
            onClick={runDelete}
            sx={{
              bgcolor: theme.m3.error,
              color: theme.m3.onError,
              '&:hover': { bgcolor: theme.m3.error },
            }}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/* 筛选胶囊（原版 FilterChip） */
const FilterPill: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({
  label,
  selected,
  onClick,
}) => {
  const theme = useTheme();
  return (
    <Button
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        height: 32,
        minHeight: 32,
        px: '12px',
        borderRadius: '8px',
        fontSize: 14,
        bgcolor: selected ? theme.m3.secondaryContainer : theme.m3.surfaceContainerLow,
        color: selected ? theme.m3.onSecondaryContainer : theme.m3.onSurfaceVariant,
        '&:hover': {
          bgcolor: selected ? theme.m3.secondaryContainer : theme.m3.surfaceContainer,
        },
      }}
    >
      {label}
    </Button>
  );
};

export default RulesPage;
