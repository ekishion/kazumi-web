import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Collapse,
  Drawer,
  Fade,
  IconButton,
  InputBase,
  ListItemButton,
  Skeleton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FastForward,
  Layers,
  ListVideo,
  Locate,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Subtitles,
  X,
} from 'lucide-react';
import { WebPlayer } from '../components/Player/WebPlayer';
import { AutoFadeImage } from '../components/common/AutoFadeImage';
import { KzStatusCard } from '../components/common/KzStatusCard';
import { KzKvList } from '../components/common/KzKvList';
import {
  SettingsDivider,
  SettingsSliderTile,
  SettingsSwitchTile,
} from '../components/settings/SettingsList';
import { formatDanmakuTimeOffset } from '../components/settings/danmakuTimeOffset';
import { useAppStore } from '../stores/useAppStore';
import { apiService } from '../api/client';
import {
  classifyPlaybackError,
  getEpisodePlaybackState,
  setEpisodePlaybackState,
  type PlaybackErrorInfo,
} from '../data/playbackState';
import type {
  ResolvedStream,
  SearchItem,
  DanmakuEpisode,
  DanmakuAnime,
  PlaybackErrorClass,
} from '../types';

/**
 * 播放页，对齐原版：
 *  - 播放器容器 = 纯黑 + 12 圆角（原版播放器区域为 `Colors.black`，Web 侧按规范收圆角）
 *  - 侧边面板 ← `Kazumi/lib/pages/video/video_side_panel.dart`（surface 底、28 圆角、滑入）
 *  - 面板 Tab ← `Kazumi/lib/pages/video/player_content_tabs.dart`（indicatorSize label、4px 指示器、
 *    primary / onSurfaceVariant 文字色），Web 侧指示器动画取 motion.durations.medium + standard
 *  - 选集 ← `Kazumi/lib/pages/video/episode_selection_panel.dart`（线路选择、当前集 primary / onPrimary）
 *  - 弹幕面板 ← `Kazumi/lib/pages/settings/danmaku/danmaku_settings.dart` 的 SettingsSliderTile 排版
 *
 * 颜色全部取自 `theme.m3`；卡片/条目圆角 12、无描边、无投影、无 hover 位移。
 */

type DrawerTab = 'episodes' | 'sources' | 'danmaku';

const DANMAKU_OFFSET_PRESETS = [-5, -1, 0, 1, 5];
const STAGE_RADIUS = '12px';
const STAGE_BACKGROUND = '#000000'; // 需求：播放器背景纯黑（非主题角色）

/** 播放/解析占位：与播放器完全相同的 16/9 黑底容器，切换不跳变；首次加载用 Skeleton */
const PlayerStagePlaceholder: React.FC<{ message: string }> = ({ message }) => {
  const theme = useTheme();
  const onBlack = theme.palette.getContrastText(STAGE_BACKGROUND);
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: STAGE_RADIUS,
        overflow: 'hidden',
        bgcolor: STAGE_BACKGROUND,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 3,
      }}
    >
      <Skeleton
        variant="rounded"
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: STAGE_RADIUS,
          bgcolor: alpha(onBlack, 0.06),
        }}
      />
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Skeleton
          variant="rounded"
          width="70%"
          height={8}
          sx={{ bgcolor: alpha(onBlack, 0.16) }}
        />
        <Typography variant="body2" component="p" sx={{ color: alpha(onBlack, 0.7), textAlign: 'center' }}>
          {message}
        </Typography>
      </Box>
    </Box>
  );
};

export const PlayerPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { m3, motion } = theme;

  const ease = motion.easings.standard;
  const tonalTransition = `background-color ${motion.durations.medium}ms ${ease}, color ${motion.durations.medium}ms ${ease}`;

  const {
    currentBangumiName,
    currentCoverUrl,
    availableSources,
    currentSource,
    currentPlugin,
    currentRoads,
    currentRoadIndex,
    currentEpisodeIndex,
    currentEpisode,
    switchEpisode,
    setPlayingContext,
    autoPlayNext,
    autoFailover,
    autoResniff,
    lowLatencyMode,
    customUserAgent,
    customReferer,
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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('episodes');
  const [activeRoad, setActiveRoad] = useState(currentRoadIndex);
  const [initialTimeSec, setInitialTimeSec] = useState<number>(0);

  // 弹幕相关状态
  const [danmakuEpisodeId, setDanmakuEpisodeId] = useState<string | number | undefined>(undefined);
  const [danmakuCount, setDanmakuCount] = useState<number>(0);
  const [matchedDanmakuTitle, setMatchedDanmakuTitle] = useState<string>('');
  const [customDanmakuSearch, setCustomDanmakuSearch] = useState<string>('');
  const [searchedAnimes, setSearchedAnimes] = useState<DanmakuAnime[]>([]);
  const [searchingDanmaku, setSearchingDanmaku] = useState(false);

  // 视频流解析状态
  const [resolvedStream, setResolvedStream] = useState<ResolvedStream | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [forceIframeMode, setForceIframeMode] = useState(false);
  const [playbackError, setPlaybackError] = useState<PlaybackErrorInfo | null>(null);
  const [expandDiagnostic, setExpandDiagnostic] = useState(false);

  // 换源与自动探活故障转移（上限 3 次）
  const MAX_FAILOVER_ATTEMPTS = 3;
  const [triedSources, setTriedSources] = useState<Set<string>>(new Set());
  const [sourceStatuses, setSourceStatuses] = useState<
    Record<string, { status: 'idle' | 'sniffing' | 'ready' | 'failed'; reason?: string }>
  >({});
  const [failoverMsg, setFailoverMsg] = useState<string | null>(null);
  const [switchingSource, setSwitchingSource] = useState(false);
  const isAutoSwitching = useRef(false);
  const sigRetryDone = useRef(false);
  // 中止嗅探请求：退出播放页时取消仍在进行的解析
  const resolveAbortRef = useRef<AbortController | null>(null);

  // 番剧详情数据（用于播放器下方元数据展示）
  const [bangumiDetail, setBangumiDetail] = useState<any | null>(null);
  const [expandSummary, setExpandSummary] = useState(false);

  // 当前集按钮引用，用于「定位当前集」（页面快捷选集 / 面板选集各自独立）
  const pageEpisodeRef = useRef<HTMLButtonElement | null>(null);
  const drawerEpisodeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setActiveRoad(currentRoadIndex);
  }, [currentRoadIndex]);

  // 切换播放源
  const switchSource = async (targetSource: SearchItem) => {
    setSwitchingSource(true);
    setFailoverMsg(`正在连接并载入【${targetSource.pluginName}】分集列表...`);
    setSourceStatuses((prev) => ({
      ...prev,
      [targetSource.src]: { status: 'sniffing' },
    }));

    try {
      const res = await apiService.queryChapters(targetSource.src);
      const newRoads = res && res.roads ? res.roads : [];
      if (newRoads.length > 0) {
        const road = newRoads[0];
        const targetEpIdx = Math.min(currentEpisodeIndex, (road.episodes?.length || 1) - 1);
        setPlayingContext(
          currentBangumiName,
          currentCoverUrl,
          newRoads,
          0,
          Math.max(0, targetEpIdx),
          targetSource,
          res.plugin ?? null,
        );
        setFailoverMsg(`已切换至【${targetSource.pluginName}】，正在嗅探视频流...`);
      } else {
        setFailoverMsg(`源【${targetSource.pluginName}】暂无可播放分集，请选择其他源`);
        setSourceStatuses((prev) => ({
          ...prev,
          [targetSource.src]: { status: 'failed', reason: '无分集数据' },
        }));
      }
    } catch (err) {
      console.error('切换播放源失败:', err);
      setFailoverMsg(`切换至【${targetSource.pluginName}】失败，请手动换源`);
      setSourceStatuses((prev) => ({
        ...prev,
        [targetSource.src]: { status: 'failed', reason: '章节获取异常' },
      }));
    } finally {
      setSwitchingSource(false);
      isAutoSwitching.current = false;
    }
  };

  // 自动故障转移：探测下一个可用源（预算：最多 3 个源、不重复试）
  const triggerAutoFailover = (cause?: PlaybackErrorInfo) => {
    if (isAutoSwitching.current) return;
    if (cause?.class === 'blocked_address') {
      // 规则指向内网：不自动换源，避免静默扫描内网
      return;
    }

    const currentSrc = currentSource?.src;
    const attemptedCount = triedSources.size;

    if (attemptedCount >= MAX_FAILOVER_ATTEMPTS) {
      setFailoverMsg(`已尝试 ${attemptedCount}/${MAX_FAILOVER_ATTEMPTS} 个源，未能提取到直接流，请手动换源或使用网页模式`);
      return;
    }

    const untried = (availableSources || []).filter(
      (s) => s.src !== currentSrc && !triedSources.has(s.src)
    );

    if (untried.length > 0) {
      isAutoSwitching.current = true;
      const nextSource = untried.find((s) => /mxdm|baimao/i.test(s.pluginName)) || untried[0];
      setFailoverMsg(`当前源未提取到直接流，正在自动尝试【${nextSource.pluginName}】(已试 ${attemptedCount}/${MAX_FAILOVER_ATTEMPTS})...`);
      setTimeout(() => {
        switchSource(nextSource);
      }, 800);
    } else {
      setFailoverMsg('当前番剧的已匹配源均未提取到直接流，可点击“换源”或切换网页模式');
    }
  };

  // 嗅探解析真实视频源
  const doResolveStream = (options?: { refresh?: boolean; preserveTime?: boolean }) => {
    if (!currentEpisode) return;

    const effectiveReferer = currentPlugin?.referer || customReferer || '';
    const effectiveUA = currentPlugin?.userAgent || customUserAgent || '';

    // 检查缓存状态
    if (!options?.refresh) {
      const cachedState = getEpisodePlaybackState(currentEpisode.url);
      if (cachedState?.resolvedStream && cachedState.resolvedStream.format !== 'none') {
        setResolvedStream(cachedState.resolvedStream);
        if (cachedState.currentTimeSec > 0 && !options?.preserveTime) {
          setInitialTimeSec(cachedState.currentTimeSec);
        }
        return;
      }
    }

    // 中止上一次仍在进行的嗅探请求
    resolveAbortRef.current?.abort();
    const abortController = new AbortController();
    resolveAbortRef.current = abortController;
    const isAborted = () => abortController.signal.aborted;

    setIsResolving(true);
    setResolvedStream(null);
    setPlaybackError(null);

    const currentSrc = currentSource?.src;
    if (currentSrc) {
      setTriedSources((prev) => new Set(prev).add(currentSrc));
      setSourceStatuses((prev) => ({
        ...prev,
        [currentSrc]: { status: 'sniffing' },
      }));
    }

    apiService
      .resolveStream(currentEpisode.url, effectiveReferer, effectiveUA, {
        refresh: options?.refresh,
        signal: abortController.signal,
      })
      .then((data) => {
        if (isAborted()) return;
        setResolvedStream(data);
        if (currentSrc) {
          setEpisodePlaybackState(currentEpisode.url, {
            resolvedStream: data,
            triedSources: Array.from(triedSources),
          });
        }

        if (!data || data.format === 'none' || !data.playUrl) {
          const classified = classifyPlaybackError({
            format: data?.format,
            streamErrorCode: data?.errorCode,
          });
          setPlaybackError(classified);
          if (currentSrc) {
            setSourceStatuses((prev) => ({
              ...prev,
              [currentSrc]: { status: 'failed', reason: classified.title },
            }));
          }
          if (autoFailover) {
            triggerAutoFailover(classified);
          }
        } else {
          setFailoverMsg(null);
          setPlaybackError(null);
          sigRetryDone.current = false;
          if (currentSrc) {
            setSourceStatuses((prev) => ({
              ...prev,
              [currentSrc]: { status: 'ready' },
            }));
          }
        }
      })
      .catch((err) => {
        // 主动中止（切集 / 退出页面）不视为错误，静默忽略
        if (isAborted() || err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError') {
          return;
        }
        console.warn('解析真实视频流失败:', err);
        const classified = classifyPlaybackError({
          status: err.response?.status,
          kazumiError: err.response?.headers?.['x-kazumi-error'],
          upstreamStatus: err.response?.headers?.['x-kazumi-upstream-status'],
          details: err.message,
        });
        if (isAborted()) return;
        setPlaybackError(classified);
        if (currentSrc) {
          setSourceStatuses((prev) => ({
            ...prev,
            [currentSrc]: { status: 'failed', reason: classified.title },
          }));
        }
        if (autoFailover) {
          triggerAutoFailover(classified);
        }
      })
      .finally(() => {
        if (!isAborted()) setIsResolving(false);
      });
  };

  // 卸载（退出播放页）时中止仍在进行的嗅探与自动换源
  useEffect(() => {
    return () => {
      resolveAbortRef.current?.abort();
      resolveAbortRef.current = null;
      isAutoSwitching.current = false;
    };
  }, []);

  useEffect(() => {
    doResolveStream();
  }, [currentEpisode?.url]);

  // 处理播放器抛出的分类错误
  const handlePlaybackError = (errEvent: {
    class: PlaybackErrorClass;
    details?: string;
    fatal: boolean;
    status?: number;
    kazumiError?: string;
    upstreamStatus?: number;
  }) => {
    const classified = classifyPlaybackError({
      status: errEvent.status,
      kazumiError: errEvent.kazumiError,
      upstreamStatus: errEvent.upstreamStatus,
      hlsDetails: errEvent.details,
    });
    setPlaybackError(classified);

    // 1. 签名过期：最多自动重新 resolve 一次续播
    if (classified.class === 'proxy_signature' && !sigRetryDone.current) {
      sigRetryDone.current = true;
      doResolveStream({ refresh: true, preserveTime: true });
      return;
    }

    // 2. 自动换源逻辑
    if (autoFailover) {
      if (classified.class === 'unsupported' || classified.class === 'media') {
        triggerAutoFailover(classified);
      } else if (classified.class === 'upstream_403' && autoResniff) {
        // 上游 403：尝试重新嗅探一次
        doResolveStream({ refresh: true });
      }
    }
  };

  // 2. 弹幕智能匹配算法
  const matchEpisodeFromList = (episodes: DanmakuEpisode[], epName: string, epIndex: number) => {
    if (!episodes || episodes.length === 0) return null;

    // 从分集名称提取集数数字（例如：“第 12 集” -> 12，“03” -> 3）
    const match = epName.match(/(?:第)?\s*(\d+(?:\.\d+)?)\s*(?:[集话話期])?/i) || epName.match(/\b(\d+)\b/);
    if (match) {
      const epNum = parseInt(match[1], 10);
      const exact = episodes.find(
        (e) => parseInt(e.episodeNumber, 10) === epNum || e.episodeTitle.includes(`第${epNum}`)
      );
      if (exact) return exact;
    }

    // 默认回退按索引
    return episodes[epIndex] || episodes[0];
  };

  useEffect(() => {
    if (!currentBangumiName || !currentEpisode) return;

    // 弹幕自动检索与匹配
    apiService
      .searchDanmakuEpisodes(currentBangumiName)
      .then((data: any) => {
        if (data && data.animes && data.animes.length > 0) {
          const anime = data.animes[0];
          setSearchedAnimes(data.animes);
          const matched = matchEpisodeFromList(anime.episodes || [], currentEpisode.name, currentEpisodeIndex);
          if (matched && matched.episodeId) {
            setDanmakuEpisodeId(matched.episodeId);
            setMatchedDanmakuTitle(`${anime.animeTitle} - ${matched.episodeTitle || `第${matched.episodeNumber}话`}`);
          }
        }
      })
      .catch((err) => console.warn('弹幕检索失败:', err));

    // 恢复历史进度
    apiService
      .getHistories()
      .then((list) => {
        const item = list.find((h) => h.episodeUrl === currentEpisode.url);
        if (item && item.positionMs > 5000) {
          setInitialTimeSec(Math.floor(item.positionMs / 1000));
        }
      })
      .catch(() => {});
  }, [currentBangumiName, currentEpisode, currentEpisodeIndex]);

  // 3. 请求 Bangumi 详情用于下方展示
  useEffect(() => {
    if (!currentBangumiName) return;
    apiService
      .searchBangumi(currentBangumiName)
      .then((res: any) => {
        if (res && res.list && res.list.length > 0) {
          setBangumiDetail(res.list[0]);
        }
      })
      .catch(() => {});
  }, [currentBangumiName]);

  // 手动搜索弹幕库
  const handleSearchDanmaku = (keyword: string) => {
    if (!keyword.trim()) return;
    setSearchingDanmaku(true);
    apiService
      .searchDanmakuEpisodes(keyword.trim())
      .then((data: any) => {
        if (data && data.animes) {
          setSearchedAnimes(data.animes);
        }
      })
      .catch((err) => console.error('搜索弹幕失败:', err))
      .finally(() => setSearchingDanmaku(false));
  };

  const handleNextEpisode = () => {
    const road = currentRoads[currentRoadIndex];
    if (road && currentEpisodeIndex + 1 < road.episodes.length) {
      switchEpisode(currentRoadIndex, currentEpisodeIndex + 1);
    }
  };

  if (!currentEpisode) {
    return (
      <Box sx={{ textAlign: 'center', py: 12, px: 1.5 }}>
        <Typography variant="h6" component="p" sx={{ mb: 2, fontWeight: 500 }}>
          当前未选择播放集数
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </Box>
    );
  }

  const currentRoad = currentRoads[currentRoadIndex];
  const hasNext = currentRoad && currentEpisodeIndex + 1 < currentRoad.episodes.length;
  const isIframeActive = forceIframeMode;
  const roadForDrawer = currentRoads[activeRoad];
  const stageState = isResolving || switchingSource ? 'resolving' : 'player';

  /** 头部文字按钮：M3 tonal（未选中 surfaceContainerHigh，选中 secondaryContainer） */
  const headerButtonSx = (active = false) => ({
    bgcolor: active ? m3.secondaryContainer : m3.surfaceContainerHigh,
    color: active ? m3.onSecondaryContainer : m3.onSurfaceVariant,
    '&:hover': {
      bgcolor: active ? m3.secondaryContainer : m3.surfaceContainerHighest,
    },
    transition: tonalTransition,
  });

  const revealCurrentEpisode = () =>
    drawerEpisodeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });

  return (
    <Box sx={{ width: '100%', maxWidth: 1300, mx: 'auto', px: 1.5, py: 1.5, pb: 6 }}>
      {/* 1. 顶栏：标题、线路标、弹幕/换源/下一集/选集 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={22} />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                component="h1"
                noWrap
                sx={{ fontWeight: 500, lineHeight: 1.25, color: m3.onSurface }}
              >
                {currentBangumiName}
              </Typography>
              {currentSource && (
                <Chip
                  label={currentSource.pluginName}
                  size="small"
                  sx={{
                    flexShrink: 0,
                    bgcolor: m3.secondaryContainer,
                    color: m3.onSecondaryContainer,
                  }}
                />
              )}
            </Box>
            <Typography variant="caption" component="p" sx={{ color: m3.onSurfaceVariant }} noWrap>
              正在播放：{currentEpisode.name}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title="弹幕管理与时间轴校准">
            <Button
              variant="text"
              size="small"
              startIcon={<MessageSquare size={16} />}
              onClick={() => {
                setDrawerTab('danmaku');
                setDrawerOpen(true);
              }}
              sx={headerButtonSx(danmakuEnabled)}
            >
              弹幕 {danmakuCount > 0 ? `(${danmakuCount})` : ''}
            </Button>
          </Tooltip>

          {availableSources.length > 1 && (
            <Button
              variant="text"
              size="small"
              startIcon={<Layers size={16} />}
              onClick={() => {
                setDrawerTab('sources');
                setDrawerOpen(true);
              }}
              sx={headerButtonSx()}
            >
              换源 ({availableSources.length})
            </Button>
          )}

          {hasNext && (
            <Button
              variant="text"
              size="small"
              startIcon={<FastForward size={16} />}
              onClick={handleNextEpisode}
              sx={headerButtonSx()}
            >
              下一集
            </Button>
          )}

          <Button
            variant="contained"
            size="small"
            startIcon={<ListVideo size={16} />}
            onClick={() => {
              setDrawerTab('episodes');
              setDrawerOpen(true);
            }}
          >
            选集
          </Button>
        </Box>
      </Box>

      {/* 2. 故障转移与探活通知条（已迁移为 M3 原语） */}
      {playbackError && !forceIframeMode && (
        <Box sx={{ mb: 2 }}>
          <KzStatusCard
            severity={playbackError.class === 'blocked_address' ? 'error' : 'warning'}
            icon={<ShieldAlert size={22} />}
            title={playbackError.title}
            description={playbackError.description}
            actions={
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setExpandDiagnostic(!expandDiagnostic)}
                  endIcon={<ChevronDown size={14} style={{ transform: expandDiagnostic ? 'rotate(180deg)' : 'none' }} />}
                  sx={{ borderRadius: '12px' }}
                >
                  诊断信息
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshCw size={14} />}
                  onClick={() => doResolveStream({ refresh: true })}
                  sx={{ borderRadius: '12px' }}
                >
                  重试嗅探
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Layers size={14} />}
                  onClick={() => {
                    setDrawerTab('sources');
                    setDrawerOpen(true);
                  }}
                  sx={{ borderRadius: '12px' }}
                >
                  换源
                </Button>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<ExternalLink size={14} />}
                  onClick={() => setForceIframeMode(true)}
                  sx={{ borderRadius: '12px' }}
                >
                  网页模式
                </Button>
              </>
            }
          />

          <Collapse in={expandDiagnostic} timeout={motion.durations.medium} easing={ease}>
            <Box
              sx={{
                mt: 1,
                p: 2,
                borderRadius: '12px',
                bgcolor: m3.surfaceContainerLow,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 500, color: m3.onSurfaceVariant }}>
                代理与解析诊断明细（外部播放器直连可能仍需代理）
              </Typography>
              <KzKvList
                dense
                items={[
                  {
                    label: '目标直链 (RealURL)',
                    value: resolvedStream?.realUrl || '未提取到',
                    copyableText: resolvedStream?.realUrl || undefined,
                  },
                  {
                    label: '代理地址 (PlayURL)',
                    value: resolvedStream?.playUrl || '未生成',
                    copyableText: resolvedStream?.playUrl ? `${window.location.origin}${resolvedStream.playUrl}` : undefined,
                  },
                  {
                    label: 'Referer 防盗链',
                    value: resolvedStream?.referer || currentPlugin?.referer || customReferer || '未设置',
                    copyableText: resolvedStream?.referer || undefined,
                  },
                  {
                    label: 'User-Agent',
                    value: resolvedStream?.userAgent || currentPlugin?.userAgent || customUserAgent || '系统默认',
                  },
                  {
                    label: 'X-Kazumi-Error',
                    value: playbackError.kazumiError || '无',
                  },
                  {
                    label: '上游 HTTP 状态',
                    value: playbackError.upstreamStatus ? String(playbackError.upstreamStatus) : (playbackError.status ? String(playbackError.status) : '无'),
                  },
                ]}
              />
            </Box>
          </Collapse>
        </Box>
      )}

      {failoverMsg && !playbackError && (
        <Alert
          severity={failoverMsg.includes('未提取') ? 'warning' : 'info'}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setDrawerTab('sources');
                setDrawerOpen(true);
              }}
            >
              手动换源
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {failoverMsg}
        </Alert>
      )}

      {/* 3. 播放器主体 / 解析占位（同尺寸黑底容器，切换淡入不跳变） */}
      <Box sx={{ mb: 3 }}>
        <Fade
          key={stageState}
          in
          appear
          timeout={{ enter: motion.durations.medium, exit: 0 }}
          easing={ease}
        >
          <Box>
            {isResolving || switchingSource ? (
              <PlayerStagePlaceholder
                message={
                  switchingSource
                    ? '正在连接新线路…'
                    : '正在嗅探解析视频流（静态规则 + Chrome CDP）…'
                }
              />
            ) : (
              <WebPlayer
                playUrl={forceIframeMode ? currentEpisode.url : resolvedStream?.playUrl || ''}
                originalUrl={resolvedStream?.originalUrl || currentEpisode.url}
                format={forceIframeMode ? 'iframe' : resolvedStream?.format || 'none'}
                isIframe={isIframeActive}
                bangumiName={currentBangumiName}
                episodeName={currentEpisode.name}
                coverUrl={currentCoverUrl}
                danmakuEpisodeId={danmakuEpisodeId}
                initialTimeSec={initialTimeSec}
                lowLatencyMode={lowLatencyMode}
                onEnded={() => {
                  if (autoPlayNext) handleNextEpisode();
                }}
                onToggleIframe={() => setForceIframeMode(!isIframeActive)}
                onOpenSources={() => {
                  setDrawerTab('sources');
                  setDrawerOpen(true);
                }}
                onDanmakuLoaded={(cnt) => setDanmakuCount(cnt)}
                onPlaybackError={handlePlaybackError}
                onRetry={() => doResolveStream({ refresh: true })}
              />
            )}
          </Box>
        </Fade>
      </Box>

      {/* 4. 播放器下方快捷分集（网格换行，不额外套滚动容器） */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="subtitle2" sx={{ color: m3.onSurfaceVariant }}>
            全部剧集 · {currentRoad?.episodes.length || 0} 集
          </Typography>
          <Tooltip title="定位当前集">
            <IconButton
              size="small"
              aria-label="定位当前集"
              onClick={() => pageEpisodeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
            >
              <Locate size={18} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
            gap: 1,
          }}
        >
          {currentRoad?.episodes.map((ep, idx) => {
            const isCurrent = idx === currentEpisodeIndex;
            return (
              <ButtonBase
                key={idx}
                ref={isCurrent ? pageEpisodeRef : undefined}
                onClick={() => switchEpisode(currentRoadIndex, idx)}
                sx={{
                  minHeight: 40,
                  px: 1,
                  py: 1,
                  borderRadius: `${theme.shape.borderRadius}px`,
                  bgcolor: isCurrent ? m3.primary : m3.surfaceContainerLow,
                  color: isCurrent ? m3.onPrimary : m3.onSurface,
                  fontSize: 12.5,
                  lineHeight: '20px',
                  transition: tonalTransition,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  display: 'block',
                }}
              >
                {ep.name}
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      {/* 5. 番剧详细卡片与评分 */}
      {bangumiDetail && (
        <Box
          sx={{
            p: 2,
            borderRadius: `${theme.shape.borderRadius}px`,
            bgcolor: m3.surfaceContainerLow,
          }}
        >
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box
              sx={{
                width: 88,
                height: 123,
                flexShrink: 0,
                borderRadius: `${theme.shape.borderRadius}px`,
                overflow: 'hidden',
                bgcolor: m3.surfaceContainerHighest,
              }}
            >
              <AutoFadeImage
                src={bangumiDetail.images?.large || currentCoverUrl}
                alt={currentBangumiName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="h6" component="h2" sx={{ fontWeight: 500, color: m3.onSurface }}>
                  {bangumiDetail.name_cn || bangumiDetail.name || currentBangumiName}
                </Typography>
                {bangumiDetail.rating?.score && (
                  <Chip
                    icon={<Star size={12} color={m3.onTertiaryContainer} />}
                    label={bangumiDetail.rating.score.toFixed(1)}
                    size="small"
                    sx={{ bgcolor: m3.tertiaryContainer, color: m3.onTertiaryContainer }}
                  />
                )}
                {bangumiDetail.eps && (
                  <Chip label={`全 ${bangumiDetail.eps} 话`} size="small" />
                )}
              </Box>

              {bangumiDetail.summary && bangumiDetail.summary.length > 80 ? (
                <Collapse
                  in={expandSummary}
                  collapsedSize={40}
                  timeout={motion.durations.medium}
                  easing={ease}
                >
                  <Typography
                    variant="body2"
                    component="p"
                    sx={{ color: m3.onSurfaceVariant, fontSize: 13, lineHeight: '20px' }}
                  >
                    {bangumiDetail.summary}
                  </Typography>
                </Collapse>
              ) : (
                <Typography
                  variant="body2"
                  component="p"
                  sx={{ color: m3.onSurfaceVariant, fontSize: 13, lineHeight: '20px' }}
                >
                  {bangumiDetail.summary || '暂无详细介绍'}
                </Typography>
              )}

              {bangumiDetail.summary && bangumiDetail.summary.length > 80 && (
                <Button
                  size="small"
                  onClick={() => setExpandSummary(!expandSummary)}
                  endIcon={
                    <ChevronRight
                      size={16}
                      style={{
                        transform: expandSummary ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: `transform ${motion.durations.medium}ms ${ease}`,
                      }}
                    />
                  }
                  sx={{ mt: 0.5, px: 1, color: m3.primary }}
                >
                  {expandSummary ? '收起' : '展开简介'}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* 6. 侧边面板：选集 / 换源 / 弹幕 */}
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        transitionDuration={{ enter: motion.durations.medium, exit: motion.durations.page }}
        slotProps={{
          transition: {
            easing: { enter: ease, exit: ease },
          },
          paper: {
            sx: {
              width: isMobile ? '100%' : 420,
              maxHeight: isMobile ? '85vh' : '100%',
              height: isMobile ? 'auto' : '100%',
              display: 'flex',
              flexDirection: 'column',
              // 面板自身不滚动，改由内部内容区滚动（避免双层滚动条）
              overflow: 'hidden',
              bgcolor: m3.surfaceContainerLow,
              p: 2,
              backgroundImage: 'none',
              // 面板圆角：底部抽屉取顶部 28，右侧面板取左侧 28（16–28 区间）
              ...(isMobile
                ? { borderTopLeftRadius: '28px', borderTopRightRadius: '28px' }
                : { borderTopLeftRadius: '28px', borderBottomLeftRadius: '28px' }),
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography
            variant="subtitle1"
            component="p"
            noWrap
            sx={{ flex: 1, minWidth: 0, fontWeight: 500, color: m3.onSurface }}
          >
            {currentBangumiName}
          </Typography>
          <IconButton aria-label="关闭面板" onClick={() => setDrawerOpen(false)}>
            <X size={20} />
          </IconButton>
        </Box>

        <Tabs
          value={drawerTab}
          onChange={(_, value) => setDrawerTab(value as DrawerTab)}
          variant="fullWidth"
          sx={{
            minHeight: 44,
            borderBottom: `1px solid ${m3.outlineVariant}`,
            '& .MuiTabs-indicator': {
              height: 3,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              backgroundColor: m3.primary,
              transition: `left ${motion.durations.medium}ms ${ease}, width ${motion.durations.medium}ms ${ease}`,
            },
            '& .MuiTab-root': {
              minHeight: 44,
              minWidth: 0,
              px: 1,
              py: 1,
              fontSize: 14,
              fontWeight: 500,
              color: m3.onSurfaceVariant,
              transition: `color ${motion.durations.medium}ms ${ease}`,
              '&.Mui-selected': { color: m3.primary },
            },
          }}
        >
          <Tab value="episodes" label="选集" />
          <Tab value="sources" label={`换源 (${availableSources.length})`} />
          <Tab value="danmaku" label="弹幕" />
        </Tabs>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 2, pr: 0.5 }}>
          <Fade
            key={drawerTab}
            in
            appear
            timeout={{ enter: motion.durations.medium, exit: 0 }}
            easing={ease}
          >
            <Box>
              {/* TAB 1：选集 */}
              {drawerTab === 'episodes' && (
                <Box>
                  {currentRoads.length > 1 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="caption"
                        component="p"
                        sx={{ display: 'block', mb: 1, color: m3.onSurfaceVariant }}
                      >
                        播放线路
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {currentRoads.map((road, index) => {
                          const active = index === activeRoad;
                          return (
                            <Chip
                              key={index}
                              label={`${road.name || `线路 ${index + 1}`} · ${road.episodes.length} 集`}
                              onClick={() => setActiveRoad(index)}
                              sx={{
                                bgcolor: active ? m3.secondaryContainer : m3.surfaceContainerHigh,
                                color: active ? m3.onSecondaryContainer : m3.onSurfaceVariant,
                                transition: tonalTransition,
                              }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  )}

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 1,
                    }}
                  >
                    <Typography variant="caption" component="p" sx={{ color: m3.onSurfaceVariant }}>
                      全部剧集 · {roadForDrawer?.episodes.length || 0} 集
                    </Typography>
                    <Tooltip title="定位当前集">
                      <IconButton size="small" aria-label="定位当前集" onClick={revealCurrentEpisode}>
                        <Locate size={18} />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
                      gap: 1,
                    }}
                  >
                    {roadForDrawer?.episodes.map((ep, idx) => {
                      const isCurrent = activeRoad === currentRoadIndex && idx === currentEpisodeIndex;
                      return (
                        <ButtonBase
                          key={idx}
                          ref={isCurrent ? drawerEpisodeRef : undefined}
                          onClick={() => {
                            switchEpisode(activeRoad, idx);
                            setDrawerOpen(false);
                          }}
                          sx={{
                            minHeight: 40,
                            px: 1,
                            py: 1,
                            borderRadius: `${theme.shape.borderRadius}px`,
                            bgcolor: isCurrent ? m3.primary : m3.surfaceContainer,
                            color: isCurrent ? m3.onPrimary : m3.onSurface,
                            fontSize: 12.5,
                            lineHeight: '20px',
                            transition: tonalTransition,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            display: 'block',
                          }}
                        >
                          {ep.name}
                        </ButtonBase>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* TAB 2：全网换源 */}
              {drawerTab === 'sources' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ px: 1, py: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: m3.onSurfaceVariant }}>
                      已尝试 {triedSources.size}/{MAX_FAILOVER_ATTEMPTS} 个源
                    </Typography>
                    <Typography variant="caption" sx={{ color: m3.onSurfaceVariant }}>
                      共 {availableSources.length} 个来源
                    </Typography>
                  </Box>
                  {availableSources.map((source, sIdx) => {
                    const isCurrent = currentSource?.src === source.src;
                    const isRecommended = /mxdm|baimao/i.test(source.pluginName);
                    const srcInfo = sourceStatuses[source.src];

                    return (
                      <ListItemButton
                        key={sIdx}
                        selected={isCurrent}
                        onClick={() => {
                          switchSource(source);
                          setDrawerTab('episodes');
                        }}
                        sx={{
                          px: 2,
                          py: 1.5,
                          minHeight: 64,
                          bgcolor: isCurrent ? undefined : m3.surfaceContainer,
                          transition: tonalTransition,
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography
                              variant="body1"
                              component="span"
                              noWrap
                              sx={{ fontWeight: 500 }}
                            >
                              {source.pluginName}
                            </Typography>
                            {isRecommended && (
                              <Chip
                                label="推荐直链"
                                size="small"
                                sx={{
                                  flexShrink: 0,
                                  bgcolor: m3.tertiaryContainer,
                                  color: m3.onTertiaryContainer,
                                }}
                              />
                            )}
                            {srcInfo?.status === 'sniffing' && (
                              <Chip
                                label="嗅探中"
                                size="small"
                                sx={{
                                  flexShrink: 0,
                                  bgcolor: m3.secondaryContainer,
                                  color: m3.onSecondaryContainer,
                                }}
                              />
                            )}
                            {srcInfo?.status === 'ready' && (
                              <Chip
                                label="可用"
                                size="small"
                                sx={{
                                  flexShrink: 0,
                                  bgcolor: m3.primaryContainer,
                                  color: m3.onPrimaryContainer,
                                }}
                              />
                            )}
                            {srcInfo?.status === 'failed' && (
                              <Chip
                                label={`失败: ${srcInfo.reason || '解析异常'}`}
                                size="small"
                                sx={{
                                  flexShrink: 0,
                                  bgcolor: m3.errorContainer,
                                  color: m3.onErrorContainer,
                                }}
                              />
                            )}
                          </Box>
                          <Typography
                            variant="caption"
                            component="p"
                            noWrap
                            sx={{
                              display: 'block',
                              color: isCurrent ? m3.onSecondaryContainer : m3.onSurfaceVariant,
                            }}
                          >
                            {source.name}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          component="span"
                          sx={{
                            ml: 1,
                            flexShrink: 0,
                            color: isCurrent ? m3.primary : m3.onSurfaceVariant,
                          }}
                        >
                          {isCurrent ? '使用中' : '切换'}
                        </Typography>
                      </ListItemButton>
                    );
                  })}
                </Box>
              )}

              {/* TAB 3：弹幕管理与时间轴校准 */}
              {drawerTab === 'danmaku' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ p: 2, borderRadius: `${theme.shape.borderRadius}px`, bgcolor: m3.surfaceContainer }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <CheckCircle2
                        size={18}
                        color={danmakuEpisodeId ? m3.primary : m3.onSurfaceVariant}
                      />
                      <Typography
                        variant="subtitle2"
                        component="p"
                        sx={{ fontWeight: 500, color: m3.onSurface }}
                      >
                        弹幕匹配状态
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      component="p"
                      sx={{ color: m3.onSurface, mb: 0.25, wordBreak: 'break-all' }}
                    >
                      {matchedDanmakuTitle || currentBangumiName}
                    </Typography>
                    <Typography variant="caption" component="p" sx={{ color: m3.onSurfaceVariant }}>
                      {danmakuEpisodeId
                        ? `已装载 ${danmakuCount} 条弹幕飘屏`
                        : '尚未匹配到弹幕条目，可在下方手动搜索'}
                    </Typography>
                  </Box>

                  <Box>
                    <SettingsSliderTile
                      leading={<Clock size={20} />}
                      title="弹幕时间校准"
                      description="弹幕出现太早就延后，太晚就提前"
                      value={danmakuOffset}
                      min={-30}
                      max={30}
                      step={0.5}
                      valueLabel={formatDanmakuTimeOffset(danmakuOffset)}
                      onChange={setDanmakuOffset}
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      {DANMAKU_OFFSET_PRESETS.map((preset) => (
                        <Chip
                          key={preset}
                          label={preset === 0 ? '与视频同步' : `${preset > 0 ? '+' : ''}${preset} 秒`}
                          onClick={() => setDanmakuOffset(preset === 0 ? 0 : danmakuOffset + preset)}
                          sx={{
                            bgcolor: m3.surfaceContainer,
                            color: m3.onSurfaceVariant,
                            transition: tonalTransition,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>

                  <SettingsDivider />

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <SettingsSwitchTile
                      leading={<Subtitles size={20} />}
                      title="显示弹幕"
                      checked={danmakuEnabled}
                      onToggle={toggleDanmaku}
                    />
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
                  </Box>

                  <SettingsDivider />

                  <Box>
                    <Typography
                      variant="subtitle2"
                      component="p"
                      sx={{ mb: 1, fontWeight: 500, color: m3.onSurface }}
                    >
                      重新匹配弹幕库
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 2,
                          py: 0.75,
                          borderRadius: '28px',
                          bgcolor: m3.surfaceContainerHigh,
                          color: m3.onSurfaceVariant,
                        }}
                      >
                        <Search size={16} />
                        <InputBase
                          placeholder="输入番剧名重新搜索…"
                          value={customDanmakuSearch}
                          onChange={(e) => setCustomDanmakuSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSearchDanmaku(customDanmakuSearch);
                          }}
                          fullWidth
                          sx={{ fontSize: 14, color: m3.onSurface }}
                        />
                      </Box>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSearchDanmaku(customDanmakuSearch)}
                        sx={{ flexShrink: 0 }}
                      >
                        搜索
                      </Button>
                    </Box>

                    {searchingDanmaku ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {[0, 1, 2].map((row) => (
                          <Skeleton key={row} variant="rounded" height={64} />
                        ))}
                      </Box>
                    ) : searchedAnimes.length > 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {searchedAnimes.map((anime) => (
                          <Box
                            key={anime.animeId}
                            sx={{
                              p: 1.5,
                              borderRadius: `${theme.shape.borderRadius}px`,
                              bgcolor: m3.surfaceContainer,
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              component="p"
                              sx={{ mb: 1, fontWeight: 500, color: m3.onSurface }}
                            >
                              {anime.animeTitle}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                              {anime.episodes?.slice(0, 16).map((ep) => {
                                const active = String(ep.episodeId) === String(danmakuEpisodeId);
                                return (
                                  <Chip
                                    key={ep.episodeId}
                                    label={ep.episodeTitle || `第${ep.episodeNumber}话`}
                                    size="small"
                                    onClick={() => {
                                      setDanmakuEpisodeId(ep.episodeId);
                                      setMatchedDanmakuTitle(
                                        `${anime.animeTitle} - ${ep.episodeTitle || `第${ep.episodeNumber}话`}`
                                      );
                                      setDrawerOpen(false);
                                    }}
                                    sx={{
                                      bgcolor: active
                                        ? m3.secondaryContainer
                                        : m3.surfaceContainerHigh,
                                      color: active
                                        ? m3.onSecondaryContainer
                                        : m3.onSurfaceVariant,
                                      transition: tonalTransition,
                                    }}
                                  />
                                );
                              })}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              )}
            </Box>
          </Fade>
        </Box>
      </Drawer>
    </Box>
  );
};

export default PlayerPage;
