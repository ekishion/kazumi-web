import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  IconButton,
  ListItemButton,
  ListItemText,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  FastForward,
  Globe,
  History,
  Info,
  Layers,
  MessageSquare,
  Palette,
  PlayCircle,
  Puzzle,
  RefreshCw,
  Sparkles,
  Subtitles,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { usePageScroll } from '../components/Layout/PageScrollContext';
import { animateScrollTo } from '../utils/scroll';
import { apiService } from '../api/client';
import {
  SettingsCategoryTile,
  SettingsDivider,
  SettingsDropdownTile,
  SettingsSection,
  SettingsSliderTile,
  SettingsSwitchTile,
  SettingsTile,
  SectionHeader,
} from '../components/settings/SettingsList';
import { formatDanmakuTimeOffset } from '../components/settings/danmakuTimeOffset';

/**
 * 我的 / 设置页，对齐原版：
 *  - 分组与分类信息层级 ← `Kazumi/lib/pages/settings/settings_page.dart`
 *    （播放 / 资源 / 应用 / 其他 四组；宽屏左侧分类栏 + 右侧详情，窄屏先列表后详情）
 *  - 详情条目排版 ← `bean/settings/settings_list.dart`（`components/settings/SettingsList.tsx`）
 *  - 各分类内容 ← `theme_settings_page.dart`、`player_settings.dart`、`danmaku/danmaku_settings.dart`
 *  - 顶部观看统计 ← `Kazumi/lib/pages/my/my_space_view.dart`
 *
 * 颜色全部取自 `theme.m3` / `theme.palette`；卡片圆角 12、无描边无投影、条目间距 8。
 */

type CategoryId = 'player' | 'danmaku' | 'appearance' | 'rules' | 'history' | 'about';

type SettingsCategory = {
  id: CategoryId;
  label: string;
  description: string;
  icon: React.ReactNode;
};

/** 分组结构 1:1 对应 settings_page.dart 的 `_settingsGroups`（按 Web 版能力裁剪） */
const SETTINGS_GROUPS: { title: string; categories: SettingsCategory[] }[] = [
  {
    title: '播放',
    categories: [
      {
        id: 'player',
        label: '播放设置',
        description: '解码、渲染与播放行为',
        icon: <PlayCircle size={18} />,
      },
      {
        id: 'danmaku',
        label: '弹幕设置',
        description: '弹幕来源与显示效果',
        icon: <Subtitles size={18} />,
      },
    ],
  },
  {
    title: '资源',
    categories: [
      {
        id: 'rules',
        label: '规则管理',
        description: '番剧资源规则',
        icon: <Puzzle size={18} />,
      },
    ],
  },
  {
    title: '应用',
    categories: [
      {
        id: 'appearance',
        label: '外观设置',
        description: '主题、配色与字体',
        icon: <Palette size={18} />,
      },
    ],
  },
  {
    title: '其他',
    categories: [
      {
        id: 'history',
        label: '观看记录',
        description: '继续观看与历史进度',
        icon: <History size={18} />,
      },
      {
        id: 'about',
        label: '关于',
        description: '版本与开源信息',
        icon: <Info size={18} />,
      },
    ],
  },
];

/**
 * 配色方案种子色：取自原版 `Kazumi/lib/bean/settings/color_type.dart` 的 `colorThemeTypes`。
 * 这些是“数据”（可选的配色种子），不是页面样式色，因此不取自主题 token。
 */
const THEME_SEEDS: { value: string; label: string }[] = [
  { value: '#4CAF50', label: '默认' },
  { value: '#009688', label: '青色' },
  { value: '#2196F3', label: '蓝色' },
  { value: '#3F51B5', label: '靛蓝色' },
  { value: '#6750A4', label: '紫罗兰色' },
  { value: '#E91E63', label: '粉红色' },
  { value: '#FFEB3B', label: '黄色' },
  { value: '#FF9800', label: '橙色' },
  { value: '#FF5722', label: '深橙色' },
];

const DANMAKU_OFFSET_PRESETS = [-5, -1, 0, 1, 5];

/** 观看统计：原版 my_space_view.dart 的 `_WatchStatsPanel`（数值首次加载用 Skeleton） */
const WatchStatsPanel: React.FC<{ bangumi: number | null; episodes: number | null }> = ({
  bangumi,
  episodes,
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        px: 2.5,
        py: 1.25,
        borderRadius: `${theme.shape.borderRadius}px`,
        backgroundColor: theme.m3.primaryContainer,
        color: theme.m3.onPrimaryContainer,
      }}
    >
      <StatCount label="看过番剧" value={bangumi} />
      <Sparkles size={18} style={{ opacity: 0.7 }} />
      <StatCount label="观看集数" value={episodes} />
    </Box>
  );
};

const StatCount: React.FC<{ label: string; value: number | null }> = ({ label, value }) => (
  <Box sx={{ textAlign: 'center', minWidth: 56 }}>
    {value === null ? (
      <Skeleton variant="text" width={32} height={28} sx={{ mx: 'auto' }} />
    ) : (
      <Typography
        variant="h6"
        component="p"
        sx={{ fontWeight: 500, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    )}
    <Typography variant="caption" component="p" sx={{ color: 'inherit', opacity: 0.85 }}>
      {label}
    </Typography>
  </Box>
);

/** 配色方案选择器：原版 theme_settings_page.dart 的 PaletteCard 对话框（此处内联展开） */
const PaletteTile: React.FC<{ value: string; onChange: (seed: string) => void }> = ({
  value,
  onChange,
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        borderRadius: `${theme.shape.borderRadius}px`,
        backgroundColor: theme.m3.surfaceContainerLow,
        px: 2,
        py: 1.5,
      }}
    >
      <Typography variant="body1" component="p" sx={{ color: theme.m3.onSurface }}>
        配色方案
      </Typography>
      <Typography
        variant="caption"
        component="p"
        sx={{ display: 'block', mt: 0.25, color: theme.m3.onSurfaceVariant }}
      >
        整套 M3 调色板由所选种子色派生
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
        {THEME_SEEDS.map((seed) => {
          const selected = seed.value.toLowerCase() === (value || '').toLowerCase();
          const onSeed = theme.palette.getContrastText(seed.value);
          return (
            <Tooltip key={seed.value} title={seed.label}>
              <ButtonBase
                onClick={() => onChange(seed.value)}
                aria-label={seed.label}
                aria-pressed={selected}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: seed.value,
                  color: onSeed,
                  border: selected ? `2px solid ${theme.m3.onSurface}` : '2px solid transparent',
                  transition: `border-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                }}
              >
                {selected && <Check size={20} />}
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('md'));
  const pageScroll = usePageScroll();

  const {
    themeMode,
    setThemeMode,
    primaryColor,
    setPrimaryColor,
    oledEnhance,
    setOledEnhance,
    autoPlayNext,
    setAutoPlayNext,
    autoFailover,
    setAutoFailover,
    autoResniff,
    setAutoResniff,
    lowLatencyMode,
    setLowLatencyMode,
    customUserAgent,
    setCustomUserAgent,
    customReferer,
    setCustomReferer,
    danmakuEnabled,
    toggleDanmaku,
    danmakuOpacity,
    setDanmakuOpacity,
    danmakuFontSize,
    setDanmakuFontSize,
    danmakuSpeed,
    setDanmakuSpeed,
    danmakuOffset,
    setDanmakuOffset,
  } = useAppStore();

  /** 原版 /settings 内嵌时默认进入「播放设置」（settings_page.dart `_categoryPath`） */
  const [selected, setSelected] = useState<CategoryId>('player');
  const [mobileDetail, setMobileDetail] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [uaDialogOpen, setUaDialogOpen] = useState(false);
  const [refererDialogOpen, setRefererDialogOpen] = useState(false);
  const [tempUA, setTempUA] = useState('');
  const [tempReferer, setTempReferer] = useState('');
  const [stats, setStats] = useState<{ bangumi: number; episodes: number } | null>(null);

  useEffect(() => {
    let alive = true;
    apiService
      .getHistories()
      .then((list) => {
        if (!alive) return;
        setStats({
          bangumi: new Set(list.map((item) => item.bangumiName)).size,
          episodes: list.length,
        });
      })
      .catch(() => {
        if (alive) setStats({ bangumi: 0, episodes: 0 });
      });
    return () => {
      alive = false;
    };
  }, []);

  const scrollPageToTop = () =>
    animateScrollTo(pageScroll?.current ?? null, 0, theme.motion.durations.scroll);

  const openCategory = (id: CategoryId) => {
    if (id === 'rules') {
      navigate('/rules');
      return;
    }
    if (id === 'history') {
      navigate('/history');
      return;
    }
    if (id === 'about') {
      setAboutOpen(true);
      return;
    }
    setSelected(id);
    if (!isWide) {
      setMobileDetail(true);
      scrollPageToTop();
    }
  };

  const closeDetail = () => {
    setMobileDetail(false);
    scrollPageToTop();
  };

  const detailTitle =
    selected === 'player' ? '播放设置' : selected === 'danmaku' ? '弹幕设置' : '外观设置';

  const showMenu = isWide || !mobileDetail;
  const showDetail = isWide || mobileDetail;

  /* ------------------------------ 分类菜单 ------------------------------ */
  const settingsMenu = (
    <Box>
      {SETTINGS_GROUPS.map((group) => (
        <Box key={group.title} component="section" sx={{ mb: 2 }}>
          <SectionHeader title={group.title} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {group.categories.map((category) => {
              const active = selected === category.id;
              // 宽屏 → 原版 _RailDestination（图标 + 标签，选中 secondaryContainer 胶囊）
              // 窄屏 → 原版 SettingsCategoryTile（圆形图标 + 标题 + 描述 + chevron）
              return isWide ? (
                <ListItemButton
                  key={category.id}
                  selected={active}
                  onClick={() => openCategory(category.id)}
                  sx={{
                    borderRadius: `${theme.shape.borderRadius}px`,
                    px: 2,
                    py: 1.25,
                    minHeight: 56,
                    color: active ? theme.m3.onSecondaryContainer : theme.m3.onSurfaceVariant,
                    transition: `background-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                  }}
                >
                  <Box sx={{ display: 'flex', mr: 2, flexShrink: 0 }}>{category.icon}</Box>
                  <ListItemText
                    primary={category.label}
                    slotProps={{
                      primary: { sx: { fontSize: 14, lineHeight: '20px', fontWeight: 500 } },
                    }}
                  />
                  <ChevronRight size={18} />
                </ListItemButton>
              ) : (
                <SettingsCategoryTile
                  key={category.id}
                  icon={category.icon}
                  title={category.label}
                  description={category.description}
                  onClick={() => openCategory(category.id)}
                />
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );

  /* ---------------------------- 详情：播放设置 ---------------------------- */
  const playerDetail = (
    <>
      <SettingsSection
        title="播放行为"
        bottomInfo="Web 版由浏览器内核解码，硬件加速取决于浏览器设置"
      >
        <SettingsSwitchTile
          leading={<PlayCircle size={20} />}
          title="自动连播"
          description="当前视频播放完毕后自动播放下一集"
          checked={autoPlayNext}
          onToggle={setAutoPlayNext}
        />
        <SettingsSwitchTile
          leading={<Layers size={20} />}
          title="自动换源"
          description="嗅探失败或播放出错时，按预算自动切换下一个可用源"
          checked={autoFailover}
          onToggle={setAutoFailover}
        />
        <SettingsSwitchTile
          leading={<RefreshCw size={20} />}
          title="失败自动重新嗅探"
          description="当上游防盗链响应 403 时，尝试刷新并重新发起嗅探"
          checked={autoResniff}
          onToggle={setAutoResniff}
        />
        <SettingsSwitchTile
          leading={<Zap size={20} />}
          title="HLS 低延迟模式"
          description="启用 hls.js lowLatencyMode，缩短起播缓冲（不稳定网络可关闭）"
          checked={lowLatencyMode}
          onToggle={setLowLatencyMode}
        />
      </SettingsSection>

      <SettingsSection
        title="请求头伪装"
        bottomInfo="优先级说明：规则配置 > 全局自定义设置 > 后端系统默认值"
      >
        <SettingsTile
          leading={<Globe size={20} />}
          title="自定义 User-Agent"
          description={customUserAgent ? customUserAgent : '使用系统默认 User-Agent'}
          value={customUserAgent ? '已设置' : '默认'}
          trailing={<ChevronRight size={20} />}
          onClick={() => {
            setTempUA(customUserAgent);
            setUaDialogOpen(true);
          }}
        />
        <SettingsTile
          leading={<Globe size={20} />}
          title="自定义 Referer"
          description={customReferer ? customReferer : '仅在规则未提供 Referer 时作为兜底'}
          value={customReferer ? '已设置' : '自动'}
          trailing={<ChevronRight size={20} />}
          onClick={() => {
            setTempReferer(customReferer);
            setRefererDialogOpen(true);
          }}
        />
      </SettingsSection>

      <SettingsSection title="观看记录">
        <SettingsTile
          leading={<History size={20} />}
          title="已记录剧集"
          description="播放进度保存在本地服务，可随时继续观看"
          value={stats === null ? <Skeleton variant="text" width={24} /> : `${stats.episodes} 集`}
          trailing={<ChevronRight size={20} />}
          onClick={() => navigate('/history')}
        />
      </SettingsSection>
    </>
  );

  /* ---------------------------- 详情：弹幕设置 ---------------------------- */
  const danmakuDetail = (
    <>
      <SettingsSection title="弹幕显示">
        <SettingsSwitchTile
          leading={<Subtitles size={20} />}
          title="显示弹幕"
          description="关闭后不再绘制弹幕，已装载的弹幕仍会保留"
          checked={danmakuEnabled}
          onToggle={toggleDanmaku}
        />
      </SettingsSection>

      <SettingsSection title="弹幕样式" bottomInfo="弹幕数据来自弹弹play 弹幕库">
        <SettingsSliderTile
          leading={<MessageSquare size={20} />}
          title="弹幕不透明度"
          value={danmakuOpacity}
          min={0.2}
          max={1}
          step={0.05}
          valueLabel={`${Math.round(danmakuOpacity * 100)}%`}
          onChange={setDanmakuOpacity}
        />
        <SettingsSliderTile
          leading={<Subtitles size={20} />}
          title="字体大小"
          value={danmakuFontSize}
          min={14}
          max={32}
          step={1}
          valueLabel={`${danmakuFontSize}`}
          onChange={setDanmakuFontSize}
        />
        <SettingsSliderTile
          leading={<FastForward size={20} />}
          title="滚动速度"
          value={danmakuSpeed}
          min={1}
          max={10}
          step={1}
          valueLabel={`${danmakuSpeed}`}
          onChange={setDanmakuSpeed}
        />
      </SettingsSection>

      <SettingsSection
        title="时间轴校准"
        description="弹幕出现太早就延后，太晚就提前"
        bottomInfo={`当前：${formatDanmakuTimeOffset(danmakuOffset)}`}
      >
        <SettingsSliderTile
          leading={<Clock size={20} />}
          title="时间偏移"
          value={danmakuOffset}
          min={-30}
          max={30}
          step={0.5}
          valueLabel={formatDanmakuTimeOffset(danmakuOffset)}
          onChange={setDanmakuOffset}
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', px: 0.5 }}>
          {DANMAKU_OFFSET_PRESETS.map((preset) => (
            <Chip
              key={preset}
              label={preset === 0 ? '与视频同步' : `${preset > 0 ? '+' : ''}${preset} 秒`}
              onClick={() =>
                setDanmakuOffset(preset === 0 ? 0 : danmakuOffset + preset)
              }
              sx={{
                backgroundColor:
                  preset === 0 ? theme.m3.surfaceContainerHigh : theme.m3.surfaceContainerLow,
                color: theme.m3.onSurfaceVariant,
                transition: `background-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
              }}
            />
          ))}
        </Box>
      </SettingsSection>
    </>
  );

  /* ---------------------------- 详情：外观设置 ---------------------------- */
  const appearanceDetail = (
    <>
      <SettingsSection title="外观">
        <SettingsDropdownTile
          leading={<Palette size={20} />}
          title="深色模式"
          value={themeMode}
          options={[
            { value: 'system' as const, label: '跟随系统' },
            { value: 'light' as const, label: '浅色' },
            { value: 'dark' as const, label: '深色' },
          ]}
          onChange={setThemeMode}
        />
        <PaletteTile value={primaryColor} onChange={setPrimaryColor} />
      </SettingsSection>

      <SettingsSection
        title="显示"
        bottomInfo="Web 版字体固定为原版随包的 MiSans"
      >
        <SettingsSwitchTile
          leading={<Sparkles size={20} />}
          title="OLED优化"
          description="深色模式下使用纯黑背景"
          checked={oledEnhance}
          onToggle={setOledEnhance}
        />
      </SettingsSection>
    </>
  );

  return (
    <Box sx={{ width: '100%', maxWidth: 1120, mx: 'auto', px: 1.5, py: 1.5 }}>
      {/* 顶部：我的 + 观看统计（原版 my_page.dart / my_space_view.dart） */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h5"
            component="h1"
            sx={{ fontWeight: 500, color: theme.m3.onSurface, fontSize: { xs: 20, sm: 24 } }}
          >
            我的
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: theme.m3.onSurfaceVariant }}>
            观看统计与偏好设置
          </Typography>
        </Box>
        <WatchStatsPanel bangumi={stats?.bangumi ?? null} episodes={stats?.episodes ?? null} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
        {showMenu && (
          <Box sx={{ width: isWide ? 264 : '100%', flexShrink: 0 }}>{settingsMenu}</Box>
        )}

        {showDetail && (
          <Fade
            key={`${selected}-${isWide ? 'wide' : 'narrow'}`}
            in
            appear
            timeout={{ enter: theme.motion.durations.medium, exit: 0 }}
            easing={theme.motion.easings.standard}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                {!isWide && (
                  <IconButton onClick={closeDetail} aria-label="返回设置分类" sx={{ ml: -1 }}>
                    <ArrowLeft size={20} />
                  </IconButton>
                )}
                <Typography
                  variant="h6"
                  component="h2"
                  sx={{ fontWeight: 500, color: theme.m3.onSurface }}
                >
                  {detailTitle}
                </Typography>
              </Box>

              {selected === 'player' && playerDetail}
              {selected === 'danmaku' && danmakuDetail}
              {selected === 'appearance' && appearanceDetail}
            </Box>
          </Fade>
        )}
      </Box>

      {/* 关于：M3 对话框（28 圆角由主题提供） */}
      <Dialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        slotProps={{ paper: { sx: { minWidth: 320, maxWidth: 440 } } }}
      >
        <DialogTitle sx={{ fontWeight: 500 }}>关于 Kazumi</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            component="p"
            sx={{ color: theme.m3.onSurfaceVariant, lineHeight: 1.7 }}
          >
            Kazumi Web 沿用原版 Kazumi 的视觉规范：Material 3 配色由种子色派生、随包 MiSans
            字体、12 圆角的扁平卡片与涟漪反馈。视频流由服务端规则采集并通过 Chrome CDP
            嗅探提取，弹幕接入弹弹play 弹幕库。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAboutOpen(false)}>了解</Button>
        </DialogActions>
      </Dialog>

      {/* 自定义 User-Agent 对话框 */}
      <Dialog
        open={uaDialogOpen}
        onClose={() => setUaDialogOpen(false)}
        slotProps={{ paper: { sx: { minWidth: 320, maxWidth: 480 } } }}
      >
        <DialogTitle sx={{ fontWeight: 500 }}>自定义 User-Agent</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: theme.m3.onSurfaceVariant, mb: 2 }}>
            若规则未特别指定 User-Agent，将采用此处配置的值；留空则回退至后端默认系统 UA。
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            placeholder="例如: Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
            value={tempUA}
            onChange={(e) => setTempUA(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUaDialogOpen(false)}>取消</Button>
          <Button
            onClick={() => {
              setCustomUserAgent(tempUA.trim());
              setUaDialogOpen(false);
            }}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 自定义 Referer 对话框 */}
      <Dialog
        open={refererDialogOpen}
        onClose={() => setRefererDialogOpen(false)}
        slotProps={{ paper: { sx: { minWidth: 320, maxWidth: 480 } } }}
      >
        <DialogTitle sx={{ fontWeight: 500 }}>自定义 Referer</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: theme.m3.onSurfaceVariant, mb: 2 }}>
            仅在规则未提供 Referer 且流自身未携带签名时生效；留空则默认回退至流 origin。
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="例如: https://www.example.com/"
            value={tempReferer}
            onChange={(e) => setTempReferer(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefererDialogOpen(false)}>取消</Button>
          <Button
            onClick={() => {
              setCustomReferer(tempReferer.trim());
              setRefererDialogOpen(false);
            }}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <SettingsDivider />
      <Typography
        variant="caption"
        component="p"
        sx={{ display: 'block', textAlign: 'center', mt: 2, color: theme.m3.onSurfaceVariant }}
      >
        Kazumi Web · Material 3
      </Typography>
    </Box>
  );
};

export default SettingsPage;
