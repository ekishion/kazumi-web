export interface Plugin {
  id?: string;
  api: string;
  type: string;
  name: string;
  version: string;
  muliSources?: boolean;
  useWebview?: boolean;
  useNativePlayer?: boolean;
  usePost?: boolean;
  useLegacyParser?: boolean;
  adBlocker?: boolean;
  userAgent?: string;
  baseURL: string;
  searchURL: string;
  searchList: string;
  searchName: string;
  searchResult: string;
  chapterRoads: string;
  chapterResult: string;
  referer?: string;
  searchMode?: 'xpath' | 'api';
  chapterMode?: 'xpath' | 'api';
  enabled?: boolean;
}

export interface SearchItem {
  pluginName: string;
  name: string;
  src: string;
}

export interface Episode {
  name: string;
  url: string;
}

export interface Road {
  name: string;
  episodes: Episode[];
  identifier: string[];
  data: string[];
}

export interface BangumiSubject {
  id: number;
  name: string;
  name_cn: string;
  summary: string;
  date?: string;
  images?: {
    large?: string;
    common?: string;
    medium?: string;
    small?: string;
    grid?: string;
  };
  rating?: {
    score?: number;
    total?: number;
  };
  eps?: number;
  collection?: {
    doing?: number;
    collect?: number;
    wish?: number;
  };
}

export interface CalendarDay {
  weekday: {
    en: string;
    cn: string;
    ja: string;
    id: number;
  };
  items: BangumiSubject[];
}

export interface DanmakuComment {
  time: number;
  mode?: number;
  type?: number;
  color: string;
  text: string;
}

export interface DanmakuEpisode {
  episodeId: number;
  episodeNumber: string;
  episodeTitle: string;
}

export interface DanmakuAnime {
  animeId: number;
  animeTitle: string;
  typeDescription?: string;
  episodes: DanmakuEpisode[];
}

export interface HistoryRecord {
  id?: number;
  bangumiName: string;
  episodeName: string;
  episodeUrl: string;
  coverUrl?: string;
  positionMs: number;
  durationMs: number;
  updatedAt?: string;
}

export interface CollectRecord {
  id?: number;
  bangumiId: number;
  bangumiName: string;
  coverUrl?: string;
  summary?: string;
  status: number;
  updatedAt?: string;
}

export type PlaybackErrorClass =
  | 'proxy_signature'
  | 'upstream_403'
  | 'blocked_address'
  | 'unsupported'
  | 'network'
  | 'media';

export interface ResolvedStream {
  originalUrl: string;
  realUrl: string;
  format: 'm3u8' | 'mp4' | 'none' | 'iframe';
  playUrl: string;
  referer: string;
  userAgent: string;
  isIframe: boolean;
  errorCode?: string;
  attempts?: string[];
}

