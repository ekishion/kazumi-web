import React, { useEffect, useRef, useState } from 'react';
import Artplayer from 'artplayer';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
import Hls from 'hls.js';
import { Box, Typography, Button, Alert, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { RefreshCw, ExternalLink, Layers } from 'lucide-react';
import { apiService } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';
import { classifyPlaybackError } from '../../data/playbackState';
import type { DanmakuComment, PlaybackErrorClass } from '../../types';

interface WebPlayerProps {
  playUrl: string;
  originalUrl?: string;
  format: 'm3u8' | 'mp4' | 'none' | 'iframe';
  isIframe?: boolean;
  bangumiName: string;
  episodeName: string;
  coverUrl?: string;
  danmakuEpisodeId?: string | number;
  initialTimeSec?: number;
  lowLatencyMode?: boolean;
  onEnded?: () => void;
  onToggleIframe?: () => void;
  onOpenSources?: () => void;
  onDanmakuLoaded?: (count: number) => void;
  onPlaybackError?: (e: {
    class: PlaybackErrorClass;
    details?: string;
    fatal: boolean;
    status?: number;
    kazumiError?: string;
    upstreamStatus?: number;
  }) => void;
  onRetry?: () => void;
}

/** 播放器容器：圆角 12（Web/UI-SPEC.md 第 3 节）、纯黑底、无描边无投影 */
const STAGE_RADIUS = '12px';
const STAGE_BACKGROUND = '#000000'; // 需求：播放器背景纯黑（非主题角色）

export const WebPlayer: React.FC<WebPlayerProps> = ({
  playUrl,
  originalUrl,
  format,
  isIframe = false,
  bangumiName,
  episodeName,
  coverUrl = '',
  danmakuEpisodeId,
  initialTimeSec = 0,
  lowLatencyMode = false,
  onEnded,
  onToggleIframe,
  onOpenSources,
  onDanmakuLoaded,
  onPlaybackError,
  onRetry: _onRetry,
}) => {
  const theme = useTheme();
  const artRef = useRef<HTMLDivElement>(null);
  const playerInstance = useRef<Artplayer | null>(null);
  const rawCommentsRef = useRef<DanmakuComment[]>([]);

  const {
    danmakuEnabled,
    danmakuOpacity,
    danmakuFontSize,
    danmakuSpeed,
    danmakuOffset,
    toggleDanmaku,
  } = useAppStore();

  const [loadError, setLoadError] = useState<string | null>(null);

  /** 播放器强调色取主题 primary（原版播放器进度条/按钮跟随 colorScheme.primary） */
  const playerTheme = theme.m3.primary;
  /** 黑底上的前景色（由主题对比度算法派生，避免硬编码白色） */
  const onBlack = theme.palette.getContrastText(STAGE_BACKGROUND);

  // 1. 初始化播放器核心实例
  useEffect(() => {
    if (isIframe || !playUrl || !artRef.current) {
      if (playerInstance.current) {
        playerInstance.current.destroy(false);
        playerInstance.current = null;
      }
      return;
    }

    setLoadError(null);

    const isM3U8 = format === 'm3u8' || playUrl.includes('.m3u8') || playUrl.includes('/stream/m3u8');
    const playerType = isM3U8 ? 'm3u8' : 'mp4';

    const art = new Artplayer({
      container: artRef.current,
      url: playUrl,
      type: playerType,
      autoplay: true,
      autoSize: false,
      // 关闭滚动时的迷你窗口，避免播放器尺寸跳变（原版播放器不改变尺寸）
      autoMini: false,
      playbackRate: true,
      aspectRatio: true,
      setting: true,
      hotkey: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      playsInline: true,
      theme: playerTheme,
      customType: {
        m3u8: (video: HTMLVideoElement, m3u8Source: string) => {
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode,
            });
            hls.loadSource(m3u8Source);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_event, data) => {
              const status = data.response?.code;
              let kazumiError: string | undefined;
              let upstreamStatus: number | undefined;

              try {
                const xhr = (data.context as any)?.xhr;
                if (xhr && typeof xhr.getResponseHeader === 'function') {
                  kazumiError = xhr.getResponseHeader('X-Kazumi-Error') || undefined;
                  const ups = xhr.getResponseHeader('X-Kazumi-Upstream-Status');
                  if (ups) upstreamStatus = parseInt(ups, 10);
                }
              } catch {
                // Ignore header parsing errors
              }

              const classified = classifyPlaybackError({
                status,
                kazumiError,
                upstreamStatus,
                hlsType: data.type,
                hlsDetails: data.details,
              });

              if (onPlaybackError) {
                onPlaybackError({
                  class: classified.class,
                  details: data.details,
                  fatal: !!data.fatal,
                  status,
                  kazumiError,
                  upstreamStatus,
                });
              } else if (data.fatal) {
                console.warn('[HLS] 播放错误:', data.type, data.details);
                setLoadError(`视频流载入中断 (${data.details})，建议换源或切换为网页嵌入模式`);
              }
            });
            (art as any).hls = hls;
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = m3u8Source;
            video.onerror = () => {
              onPlaybackError?.({
                class: 'media',
                details: 'Safari 原生 HLS 加载错误',
                fatal: true,
              });
            };
          } else {
            if (onPlaybackError) {
              onPlaybackError({
                class: 'unsupported',
                details: '当前浏览器不支持 HLS 播放',
                fatal: true,
              });
            } else {
              art.notice.show = '当前浏览器不支持 HLS 播放';
            }
          }
        },
      },
      plugins: [
        artplayerPluginDanmuku({
          danmuku: [],
          speed: danmakuSpeed || 5,
          opacity: danmakuOpacity,
          fontSize: danmakuFontSize,
          color: onBlack,
          mode: 0,
          margin: [10, '25%'],
          antiOverlap: true,
          synchronousPlayback: false,
          lockTime: 3,
          maxLength: 100,
          visible: danmakuEnabled,
          emitter: true, // 开启原生弹幕发射器！
          beforeEmit: (danmu) => {
            art.notice.show = `发送弹幕: ${danmu.text}`;
            return true;
          },
        }),
      ],
    });

    playerInstance.current = art;

    art.on('video:error', () => {
      onPlaybackError?.({
        class: 'media',
        details: '视频底层加载或解码错误',
        fatal: true,
      });
    });

    // 恢复历史进度
    if (initialTimeSec > 5) {
      art.on('ready', () => {
        art.currentTime = initialTimeSec;
        art.notice.show = `已自动恢复播放进度: ${Math.floor(initialTimeSec / 60)}分${Math.floor(initialTimeSec % 60)}秒`;
      });
    }

    // 定时保存历史记录（每 8 秒）
    let lastSaveSec = 0;
    art.on('video:timeupdate', () => {
      const current = Math.floor(art.currentTime);
      const total = Math.floor(art.duration);
      if (current > 0 && total > 0 && Math.abs(current - lastSaveSec) >= 8) {
        lastSaveSec = current;
        apiService
          .saveHistory({
            bangumiName,
            episodeName,
            episodeUrl: originalUrl || playUrl,
            coverUrl,
            positionMs: current * 1000,
            durationMs: total * 1000,
          })
          .catch(() => {});
      }
    });

    if (onEnded) {
      art.on('video:ended', onEnded);
    }

    // 全局快捷键监听 (D: 弹幕开关, 空格: 暂停/播放)
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.code === 'KeyD') {
        toggleDanmaku();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ((art as any).hls) {
        try {
          (art as any).hls.destroy();
        } catch {
          // Ignore destroy errors
        }
      }
      art.destroy(false);
      playerInstance.current = null;
    };
  }, [playUrl, format, isIframe]);

  // 2. 主题变化时只更新强调色，不重建播放器（避免播放中断/尺寸跳变）
  useEffect(() => {
    if (playerInstance.current) {
      playerInstance.current.theme = playerTheme;
    }
  }, [playerTheme]);

  // 3. 独立拉取并热更新弹幕（根据 offset 动态重算时间）
  useEffect(() => {
    if (isIframe || !danmakuEpisodeId || !playerInstance.current) return;

    apiService
      .getDanmakuComments(danmakuEpisodeId)
      .then((comments) => {
        rawCommentsRef.current = comments || [];
        if (onDanmakuLoaded) {
          onDanmakuLoaded(comments.length);
        }

        if (!playerInstance.current || comments.length === 0) return;
        const danmakuPlugin = (playerInstance.current.plugins as any).artplayerPluginDanmuku;
        if (danmakuPlugin && typeof danmakuPlugin.load === 'function') {
          const formatted = comments.map((c) => ({
            text: c.text,
            time: Math.max(0, c.time + danmakuOffset),
            mode: (c.mode !== undefined ? c.mode : (c.type === 4 ? 2 : c.type === 5 ? 1 : 0)) as 0 | 1 | 2,
            color: c.color || onBlack,
          }));
          danmakuPlugin.load(formatted);
          playerInstance.current.notice.show = `已成功装载 ${comments.length} 条弹弹play弹幕`;
        }
      })
      .catch((err) => console.warn('装载弹幕失败:', err));
  }, [danmakuEpisodeId, isIframe]);

  // 4. 响应弹幕时间偏移 (Offset) 微调
  useEffect(() => {
    if (!playerInstance.current || rawCommentsRef.current.length === 0) return;
    const danmakuPlugin = (playerInstance.current.plugins as any).artplayerPluginDanmuku;
    if (danmakuPlugin && typeof danmakuPlugin.load === 'function') {
      const formatted = rawCommentsRef.current.map((c) => ({
        text: c.text,
        time: Math.max(0, c.time + danmakuOffset),
        mode: (c.mode !== undefined ? c.mode : (c.type === 4 ? 2 : c.type === 5 ? 1 : 0)) as 0 | 1 | 2,
        color: c.color || onBlack,
      }));
      danmakuPlugin.load(formatted);
      if (danmakuOffset !== 0) {
        playerInstance.current.notice.show = `弹幕偏移已调至: ${danmakuOffset > 0 ? '+' : ''}${danmakuOffset} 秒`;
      }
    }
  }, [danmakuOffset]);

  // 5. 响应弹幕样式设置更新（默认值始终来自 store）
  useEffect(() => {
    if (playerInstance.current) {
      const danmakuPlugin = (playerInstance.current.plugins as any).artplayerPluginDanmuku;
      if (danmakuPlugin && typeof danmakuPlugin.config === 'function') {
        danmakuPlugin.config({
          opacity: danmakuOpacity,
          fontSize: danmakuFontSize,
          speed: danmakuSpeed || 5,
          visible: danmakuEnabled,
        });
      }
    }
  }, [danmakuEnabled, danmakuOpacity, danmakuFontSize, danmakuSpeed]);

  // 6. iframe 嵌入播放模式：保持与原生播放器完全一致的 16/9 黑底容器，切换不跳变
  if (isIframe) {
    const embedUrl = originalUrl || playUrl;
    return (
      <Box sx={{ width: '100%', mb: 2 }}>
        <Alert
          severity="info"
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              {onToggleIframe && (
                <Button color="inherit" size="small" onClick={onToggleIframe} startIcon={<RefreshCw size={14} />}>
                  尝试原生播放
                </Button>
              )}
              <Button
                color="inherit"
                size="small"
                component="a"
                href={embedUrl}
                target="_blank"
                rel="noreferrer"
                startIcon={<ExternalLink size={14} />}
              >
                新窗口打开
              </Button>
            </Box>
          }
          sx={{ mb: 1.5 }}
        >
          当前处于【网页嵌入播放模式】。如遇外部站点防护，可点击右侧新窗口打开或切换其它源。
        </Alert>

        <Box
          sx={{
            width: '100%',
            aspectRatio: '16/9',
            borderRadius: STAGE_RADIUS,
            overflow: 'hidden',
            bgcolor: STAGE_BACKGROUND,
          }}
        >
          <iframe
            src={embedUrl}
            title={episodeName}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </Box>
      </Box>
    );
  }

  // 7. 无直接视频流时的空状态（黑底、12 圆角、无描边）
  if (!playUrl || format === 'none') {
    return (
      <Box
        sx={{
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: STAGE_RADIUS,
          bgcolor: STAGE_BACKGROUND,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          textAlign: 'center',
          color: onBlack,
        }}
      >
        <Typography variant="h6" component="p" sx={{ mb: 1, fontWeight: 500, color: 'inherit' }}>
          当前源暂无可播放的直接视频流
        </Typography>
        <Typography
          variant="body2"
          component="p"
          sx={{ mb: 3, maxWidth: 520, color: alpha(onBlack, 0.7), lineHeight: 1.6 }}
        >
          该站点的当前分集未提取到直接 m3u8。系统支持一键无缝全网换源，或切换外部网页播放。
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {onOpenSources && (
            <Button variant="contained" startIcon={<Layers size={16} />} onClick={onOpenSources}>
              全网换源
            </Button>
          )}
          {onToggleIframe && (
            <Button
              variant="text"
              onClick={onToggleIframe}
              sx={{
                color: onBlack,
                bgcolor: alpha(onBlack, 0.12),
                '&:hover': { bgcolor: alpha(onBlack, 0.2) },
                transition: `background-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
              }}
            >
              尝试外部网页嵌入
            </Button>
          )}
        </Box>
      </Box>
    );
  }

  // 8. 原生 Artplayer 播放器（emphasis 色取主题 primary）
  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      {loadError && (
        <Alert
          severity="warning"
          action={
            onToggleIframe && (
              <Button color="inherit" size="small" onClick={onToggleIframe}>
                切换网页模式
              </Button>
            )
          }
          sx={{ mb: 1.5 }}
        >
          {loadError}
        </Alert>
      )}

      <Box
        ref={artRef}
        sx={{
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: STAGE_RADIUS,
          overflow: 'hidden',
          bgcolor: STAGE_BACKGROUND,
        }}
      />
    </Box>
  );
};

export default WebPlayer;
