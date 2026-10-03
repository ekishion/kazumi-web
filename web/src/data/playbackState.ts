import type { PlaybackErrorClass, ResolvedStream } from '../types';

export interface PlaybackErrorInfo {
  class: PlaybackErrorClass;
  title: string;
  description: string;
  details?: string;
  status?: number;
  kazumiError?: string;
  upstreamStatus?: number;
  rawUrl?: string;
}

export interface EpisodePlaybackState {
  resolvedStream: ResolvedStream | null;
  triedSources: string[];
  lastError: PlaybackErrorInfo | null;
  currentTimeSec: number;
  updatedAt: number;
}

const playbackCache = new Map<string, EpisodePlaybackState>();

export function getEpisodePlaybackState(url: string): EpisodePlaybackState | undefined {
  if (!url) return undefined;
  return playbackCache.get(url);
}

export function setEpisodePlaybackState(
  url: string,
  partial: Partial<EpisodePlaybackState>,
): void {
  if (!url) return;
  const prev = playbackCache.get(url) || {
    resolvedStream: null,
    triedSources: [],
    lastError: null,
    currentTimeSec: 0,
    updatedAt: Date.now(),
  };
  playbackCache.set(url, {
    ...prev,
    ...partial,
    updatedAt: Date.now(),
  });
}

export function clearEpisodePlaybackState(url?: string): void {
  if (url) {
    playbackCache.delete(url);
  } else {
    playbackCache.clear();
  }
}

/**
 * 纯函数错误分类：根据 HTTP 状态码、X-Kazumi-Error 头与 HLS 事件判定错误类
 */
export function classifyPlaybackError(params: {
  status?: number;
  kazumiError?: string;
  upstreamStatus?: number;
  hlsType?: string;
  hlsDetails?: string;
  format?: string;
  streamErrorCode?: string;
  details?: string;
}): PlaybackErrorInfo {
  const { status, kazumiError, upstreamStatus, hlsType, hlsDetails, format, streamErrorCode, details } =
    params;

  // 1. SSRF 拦截
  if (
    streamErrorCode === 'blocked_address' ||
    kazumiError === 'blocked_address' ||
    (status === 400 && kazumiError === 'blocked_address')
  ) {
    return {
      class: 'blocked_address',
      title: '源地址被阻断（安全保护）',
      description: '规则指定的源地址解析为私网或环回地址，已触发安全策略拒绝访问。',
      status,
      kazumiError: 'blocked_address',
      upstreamStatus,
      details: details || hlsDetails,
    };
  }

  // 2. 签名失效 / 过期
  if (
    kazumiError?.startsWith('signature_') ||
    (status === 403 && kazumiError?.startsWith('signature_'))
  ) {
    return {
      class: 'proxy_signature',
      title: '代理签名已失效',
      description: '播放临时签名凭证已过期或签名不匹配，可自动重新嗅探获取新凭证续播。',
      status: status ?? 403,
      kazumiError,
      upstreamStatus,
      details: details || hlsDetails,
    };
  }

  // 3. 上游 403 防盗链
  if (
    upstreamStatus === 403 ||
    kazumiError === 'upstream_403' ||
    (status === 403 && !kazumiError?.startsWith('signature_'))
  ) {
    return {
      class: 'upstream_403',
      title: '上游源拒绝访问（防盗链）',
      description: '目标视频源校验了 Referer / 签名参数并拒绝访问，建议换源或使用网页嵌入模式。',
      status: status ?? 403,
      kazumiError: kazumiError || 'upstream_403',
      upstreamStatus: upstreamStatus ?? 403,
      details: details || hlsDetails,
    };
  }

  // 4. 格式不支持 / 无法嗅探
  if (format === 'none' || streamErrorCode === 'unsupported') {
    return {
      class: 'unsupported',
      title: '未嗅探到有效流媒体',
      description: '未在页面中提取到可播放的 HLS 或 MP4 视频直链，请尝试其他播放源。',
      status,
      kazumiError: streamErrorCode || 'unsupported',
      details: details || hlsDetails,
    };
  }

  // 5. 媒体解码错误
  if (hlsType === 'mediaError') {
    return {
      class: 'media',
      title: '视频流解码失败',
      description: '视频数据格式或编码不受当前浏览器解码器支持，建议切换播放源。',
      status,
      kazumiError,
      details: details || hlsDetails,
    };
  }

  // 6. 网络层错误
  if (hlsType === 'networkError' || status === 502 || status === 504 || kazumiError === 'timeout') {
    return {
      class: 'network',
      title: '视频网络传输中断',
      description: '视频流分片请求失败或超时，请检查网络连接后重试。',
      status: status ?? 502,
      kazumiError: kazumiError || 'network_error',
      details: details || hlsDetails,
    };
  }

  // 兜底
  return {
    class: 'unsupported',
    title: '播放出现异常',
    description: details || hlsDetails || '视频播放遭遇未知异常，建议更换其他播放线路。',
    status,
    kazumiError,
    details: details || hlsDetails,
  };
}
