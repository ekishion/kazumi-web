import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Road, Episode, SearchItem, Plugin } from '../types';
import { DEFAULT_SEED } from '../theme/m3';

interface AppState {
  // 主题与外观
  // 原版默认 ThemeMode.system（跟随系统），此处保持一致
  themeMode: 'system' | 'light' | 'dark';
  oledEnhance: boolean;
  primaryColor: string;
  setThemeMode: (mode: 'system' | 'light' | 'dark') => void;
  setOledEnhance: (enabled: boolean) => void;
  setPrimaryColor: (color: string) => void;

  // 播放器状态（属播放态，currentPlugin 不持久化）
  currentBangumiName: string;
  currentCoverUrl: string;
  availableSources: SearchItem[];
  currentSource: SearchItem | null;
  currentPlugin: Plugin | null;
  currentRoads: Road[];
  currentRoadIndex: number;
  currentEpisodeIndex: number;
  currentEpisode: Episode | null;
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuSpeed: number;
  danmakuOffset: number;
  autoPlayNext: boolean;

  // 播放配置项（持久化）
  autoFailover: boolean;
  autoResniff: boolean;
  lowLatencyMode: boolean;
  customUserAgent: string;
  customReferer: string;

  setAutoPlayNext: (enabled: boolean) => void;
  setAutoFailover: (enabled: boolean) => void;
  setAutoResniff: (enabled: boolean) => void;
  setLowLatencyMode: (enabled: boolean) => void;
  setCustomUserAgent: (ua: string) => void;
  setCustomReferer: (referer: string) => void;

  setAvailableSources: (sources: SearchItem[], activeSource?: SearchItem | null) => void;
  setCurrentSource: (source: SearchItem | null) => void;
  setCurrentPlugin: (plugin: Plugin | null) => void;
  setPlayingContext: (
    bangumiName: string,
    coverUrl: string,
    roads: Road[],
    roadIndex: number,
    episodeIndex: number,
    source?: SearchItem | null,
    plugin?: Plugin | null,
  ) => void;
  switchEpisode: (roadIndex: number, episodeIndex: number) => void;
  toggleDanmaku: () => void;
  setDanmakuOpacity: (val: number) => void;
  setDanmakuFontSize: (val: number) => void;
  setDanmakuSpeed: (val: number) => void;
  setDanmakuOffset: (val: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      themeMode: 'system', // 原版默认跟随系统（ThemeMode.system）
      oledEnhance: false,
      // 种子色：原版默认 Colors.green = #4CAF50，整套 M3 调色板由它推导
      primaryColor: DEFAULT_SEED,
      setThemeMode: (themeMode) => set({ themeMode }),
      setOledEnhance: (oledEnhance) => set({ oledEnhance }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),

      currentBangumiName: '',
      currentCoverUrl: '',
      availableSources: [],
      currentSource: null,
      currentPlugin: null,
      currentRoads: [],
      currentRoadIndex: 0,
      currentEpisodeIndex: 0,
      currentEpisode: null,
      danmakuEnabled: true,
      danmakuOpacity: 0.85,
      danmakuFontSize: 22,
      danmakuSpeed: 5,
      danmakuOffset: 0,
      autoPlayNext: true,

      // 播放设置默认值
      autoFailover: true,
      autoResniff: true,
      lowLatencyMode: false,
      customUserAgent: '',
      customReferer: '',

      setAutoPlayNext: (autoPlayNext) => set({ autoPlayNext }),
      setAutoFailover: (autoFailover) => set({ autoFailover }),
      setAutoResniff: (autoResniff) => set({ autoResniff }),
      setLowLatencyMode: (lowLatencyMode) => set({ lowLatencyMode }),
      setCustomUserAgent: (customUserAgent) => set({ customUserAgent }),
      setCustomReferer: (customReferer) => set({ customReferer }),

      setAvailableSources: (sources, activeSource) => {
        set((state) => ({
          availableSources: sources,
          currentSource: activeSource !== undefined ? activeSource : state.currentSource,
        }));
      },

      setCurrentSource: (currentSource) => set({ currentSource }),
      setCurrentPlugin: (currentPlugin) => set({ currentPlugin }),

      setPlayingContext: (bangumiName, coverUrl, roads, roadIndex, episodeIndex, source, plugin) => {
        const road = roads[roadIndex];
        const episode = road && road.episodes ? road.episodes[episodeIndex] : null;
        set((state) => ({
          currentBangumiName: bangumiName,
          currentCoverUrl: coverUrl,
          currentRoads: roads,
          currentRoadIndex: roadIndex,
          currentEpisodeIndex: episodeIndex,
          currentEpisode: episode,
          currentSource: source !== undefined ? source : state.currentSource,
          currentPlugin: plugin !== undefined ? plugin : (state.currentPlugin ?? null),
          danmakuOffset: 0, // 换集重置偏移
        }));
      },

      switchEpisode: (roadIndex, episodeIndex) => {
        const { currentRoads } = get();
        const road = currentRoads[roadIndex];
        if (road && road.episodes && road.episodes[episodeIndex]) {
          set({
            currentRoadIndex: roadIndex,
            currentEpisodeIndex: episodeIndex,
            currentEpisode: road.episodes[episodeIndex],
            danmakuOffset: 0,
          });
        }
      },

      toggleDanmaku: () => set((state) => ({ danmakuEnabled: !state.danmakuEnabled })),
      setDanmakuOpacity: (danmakuOpacity) => set({ danmakuOpacity }),
      setDanmakuFontSize: (danmakuFontSize) => set({ danmakuFontSize }),
      setDanmakuSpeed: (danmakuSpeed) => set({ danmakuSpeed }),
      setDanmakuOffset: (danmakuOffset) => set({ danmakuOffset }),
    }),
    {
      name: 'kazumi-web-storage',
      version: 3,
      // v1 → v2：主题色改为 M3 种子色。旧的硬编码墨绿 #2E5B28 迁移为原版默认种子 #4CAF50。
      // v2 → v3：增加播放设置（自动换源、自动重嗅探、低延迟模式、自定义 UA/Referer）。
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2 && (state.primaryColor === '#2E5B28' || !state.primaryColor)) {
          state.primaryColor = DEFAULT_SEED;
        }
        if (version < 3) {
          if (state.autoFailover === undefined) state.autoFailover = true;
          if (state.autoResniff === undefined) state.autoResniff = true;
          if (state.lowLatencyMode === undefined) state.lowLatencyMode = false;
          if (state.customUserAgent === undefined) state.customUserAgent = '';
          if (state.customReferer === undefined) state.customReferer = '';
        }
        return state;
      },
      partialize: (state) => ({
        themeMode: state.themeMode,
        oledEnhance: state.oledEnhance,
        primaryColor: state.primaryColor,
        danmakuEnabled: state.danmakuEnabled,
        danmakuOpacity: state.danmakuOpacity,
        danmakuFontSize: state.danmakuFontSize,
        danmakuSpeed: state.danmakuSpeed,
        autoPlayNext: state.autoPlayNext,
        autoFailover: state.autoFailover,
        autoResniff: state.autoResniff,
        lowLatencyMode: state.lowLatencyMode,
        customUserAgent: state.customUserAgent,
        customReferer: state.customReferer,
      }),
    }
  )
);
