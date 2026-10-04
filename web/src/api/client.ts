import axios from 'axios';
import { useAppStore } from '../stores/useAppStore';
import type {
  Plugin,
  SearchItem,
  Road,
  BangumiSubject,
  CalendarDay,
  DanmakuComment,
  HistoryRecord,
  CollectRecord,
  ResolvedStream,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
});

export interface MirrorPingResult {
  success: boolean;
  status: number;
  latency: number;
  endpoint: string;
  message: string;
}

export const apiService = {
  // 规则管理
  getRules: () => api.get<Plugin[]>('/rules').then((r) => r.data || []),
  saveRule: (rule: Plugin) => api.post<Plugin>('/rules', rule).then((r) => r.data),
  deleteRule: (id: string) => api.delete(`/rules/${id}`).then((r) => r.data),
  toggleRule: (id: string, enabled: boolean) =>
    api.patch(`/rules/${id}/toggle`, { enabled }).then((r) => r.data),
  getMarketRules: () =>
    api.get<{ name: string; version: string; type: string }[]>('/rules/market').then((r) => r.data || []),
  installMarketRule: (name: string) =>
    api.post<Plugin>('/rules/market/install', { name }).then((r) => r.data),

  // 搜索与章节
  search: (keyword: string, ruleId?: string) =>
    api.get<SearchItem[]>('/search', { params: { keyword, ruleId } }).then((r) => r.data || []),
  queryChapters: (url: string, ruleId?: string) =>
    api.get<{ plugin: Plugin; roads: Road[] }>('/chapters', { params: { url, ruleId } }).then((r) => ({
      plugin: r.data?.plugin,
      roads: (r.data?.roads || []).map((road) => ({
        ...road,
        episodes: road.episodes || [],
      })),
    })),

  // Bangumi
  getCalendar: () => {
    const mirror = useAppStore.getState().bangumiMirror;
    return api.get<CalendarDay[]>('/bangumi/calendar', { params: mirror ? { mirror } : {} }).then((r) => r.data || []);
  },
  getSubjectDetail: (id: string | number) => {
    const mirror = useAppStore.getState().bangumiMirror;
    return api.get<BangumiSubject>(`/bangumi/subject/${id}`, { params: mirror ? { mirror } : {} }).then((r) => r.data);
  },
  getSubjectCharacters: (id: string | number) => {
    const mirror = useAppStore.getState().bangumiMirror;
    return api.get<any[]>(`/bangumi/subject/${id}/characters`, { params: mirror ? { mirror } : {} }).then((r) => r.data || []);
  },
  searchBangumi: (keyword: string) => {
    const mirror = useAppStore.getState().bangumiMirror;
    return api.get<any>(`/bangumi/search`, { params: { keyword, ...(mirror ? { mirror } : {}) } }).then((r) => r.data || {});
  },
  pingBangumiMirror: (mirror: string) =>
    api.get<MirrorPingResult>('/bangumi/ping', { params: { mirror } }).then((r) => r.data),

  // 弹幕
  searchDanmakuEpisodes: (title: string) =>
    api.get<any>(`/danmaku/episodes`, { params: { title } }).then((r) => r.data || {}),
  getDanmakuComments: (episodeId: string | number) =>
    api.get<DanmakuComment[]>(`/danmaku/comments`, { params: { episodeId } }).then((r) => r.data || []),

  // 用户历史与收藏
  getHistories: () => api.get<HistoryRecord[]>('/user/history').then((r) => r.data || []),
  saveHistory: (item: HistoryRecord) => api.post<HistoryRecord>('/user/history', item).then((r) => r.data),
  deleteHistory: (id: number) => api.delete(`/user/history/${id}`).then((r) => r.data),
  clearHistories: () => api.delete('/user/history').then((r) => r.data),

  getCollects: () => api.get<CollectRecord[]>('/user/collect').then((r) => r.data || []),
  saveCollect: (item: CollectRecord) => api.post<CollectRecord>('/user/collect', item).then((r) => r.data),
  deleteCollect: (bangumiId: number) => api.delete(`/user/collect/${bangumiId}`).then((r) => r.data),

  // 智能嗅探解析流媒体（可传入 AbortSignal，用于离开页面时中止请求）
  resolveStream: (url: string, referer = '', ua = '', options?: { refresh?: boolean; signal?: AbortSignal }) =>
    api
      .get<ResolvedStream>('/stream/resolve', {
        params: {
          url,
          referer,
          ua,
          ...(options?.refresh ? { refresh: '1' } : {}),
        },
        signal: options?.signal,
      })
      .then((r) => r.data),
};
