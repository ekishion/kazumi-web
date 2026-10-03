import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  Fade,
  IconButton,
  InputBase,
  Skeleton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { ArrowLeft, Clock, CornerUpLeft, Search as SearchIcon, SearchX, X } from 'lucide-react';

import { apiService } from '../api/client';
import { cached, peek } from '../data/requestCache';
import { KzSearchResultCard } from '../components/KzSearchResultCard';
import { useAppStore } from '../stores/useAppStore';
import type { SearchItem } from '../types';

/**
 * 番剧搜索，对齐原版 `Kazumi/lib/pages/search/search_page.dart`：
 *  - 顶栏「番剧搜索」+ M3 SearchBar（surfaceContainerHigh / 全圆角 / 高 64 / elevation 0）
 *  - 提交后搜索栏 pinned（原版 pinSearch）
 *  - 未搜索：发现态（最近搜索列表，ListTile 圆角 16）
 *  - 已搜索：「搜索结果」+ 结果网格（列数 = max(2, floor(width / 180))，列间距 12、行间距 20）
 *  - 仅首次加载使用骨架；数据走 cached/peek（key: search:<keyword>…），切回不闪烁
 *  - 规则采集源结果是 Web 版用于直接播放的额外入口（原版此处只有 Bangumi 结果）
 */

const HISTORY_KEY = 'kz-search-history';
const HISTORY_MAX = 10;
/** 原版搜索框最小高度 constraints: BoxConstraints(minHeight: 64) */
const SEARCH_BAR_HEIGHT = 64;
const APP_BAR_HEIGHT = 56;

function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(list: string[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 隐私模式下写入失败时忽略：搜索本身不受影响
  }
}

const EmptyPane: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        color: theme.m3.onSurfaceVariant,
      }}
    >
      {icon}
      <Typography sx={{ fontSize: 16, lineHeight: '24px', color: theme.m3.onSurface }}>
        {title}
      </Typography>
    </Box>
  );
};

export const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();
  const theme = useTheme();
  const setPlayingContext = useAppStore((state) => state.setPlayingContext);

  const [input, setInput] = useState(query);
  const [activeTab, setActiveTab] = useState(0);
  const [ruleResults, setRuleResults] = useState<SearchItem[]>([]);
  const [bangumiResults, setBangumiResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>(() => readHistory());
  const [managing, setManaging] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const ruleKey = `search:${query}:rules`;
  const bangumiKey = `search:${query}:bangumi`;

  useEffect(() => {
    setInput(query);
  }, [query]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ------------------------------ 搜索历史 ------------------------------ */
  useEffect(() => {
    if (!query) return;
    setHistory((prev) => [query, ...prev.filter((item) => item !== query)].slice(0, HISTORY_MAX));
  }, [query]);

  // 持久化放在 effect 里（保持 setState 更新函数为纯函数）
  useEffect(() => {
    writeHistory(history);
  }, [history]);

  /* ------------------------------- 结果请求 ------------------------------- */
  useEffect(() => {
    if (!query) {
      setRuleResults([]);
      setBangumiResults([]);
      setLoading(false);
      return;
    }

    const cachedRules = peek<SearchItem[]>(ruleKey);
    const cachedBangumi = peek<any[]>(bangumiKey);
    setRuleResults(cachedRules ?? []);
    setBangumiResults(cachedBangumi ?? []);
    // 命中缓存直接渲染，只有首次加载才显示骨架
    setLoading(cachedRules === undefined || cachedBangumi === undefined);

    let alive = true;
    void Promise.allSettled([
      cached(ruleKey, () => apiService.search(query)),
      cached(bangumiKey, () => apiService.searchBangumi(query).then((res) => (res?.list ?? []) as any[])),
    ]).then(([ruleRes, bangumiRes]) => {
      if (!alive) return;
      if (ruleRes.status === 'fulfilled') {
        setRuleResults(Array.isArray(ruleRes.value) ? ruleRes.value : []);
      }
      if (bangumiRes.status === 'fulfilled') {
        setBangumiResults(Array.isArray(bangumiRes.value) ? bangumiRes.value : []);
      }
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [query, ruleKey, bangumiKey]);

  const submit = useCallback(
    (value?: string) => {
      const keyword = (value ?? input).trim();
      if (!keyword) {
        setInput('');
        navigate('/search', { replace: true });
        return;
      }
      if (keyword === query) return;
      navigate(`/search?q=${encodeURIComponent(keyword)}`);
    },
    [input, navigate, query],
  );

  const clearSearch = () => {
    setInput('');
    setManaging(false);
    navigate('/search', { replace: true });
  };

  const removeHistory = (keyword: string) => {
    setHistory((prev) => prev.filter((item) => item !== keyword));
  };

  const clearHistory = () => {
    setHistory([]);
    setManaging(false);
  };

  const handlePlayRuleItem = async (item: SearchItem) => {
    try {
      const res = await cached(`search:${query}:chapters:${item.src}`, () =>
        apiService.queryChapters(item.src),
      );
      if (res.roads && res.roads.length > 0) {
        setPlayingContext(item.name, '', res.roads, 0, 0, item, res.plugin ?? null);
        navigate('/play');
      }
    } catch (err) {
      console.error('解析分集线路失败:', err);
      alert('解析分集线路失败，请尝试其他源');
    }
  };

  /* --------------------------- 内容宽度与列数 --------------------------- */
  /** 页面左右留白统一 12（StyleString.safeSpace；原版 search_page.dart 为 20/32） */
  const horizontal = 12;
  const contentWidth = Math.min(
    query ? 1120 : 760,
    Math.max(240, viewportWidth - horizontal * 2),
  );
  // 原版 _SearchResultGrid: columns = max(2, (width / 180).floor())
  const columns = Math.max(2, Math.floor(contentWidth / 180));

  const searchField = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        minHeight: SEARCH_BAR_HEIGHT,
        px: '8px',
        borderRadius: '9999px',
        bgcolor: theme.m3.surfaceContainerHigh,
      }}
    >
      <IconButton onClick={() => submit()} aria-label="搜索">
        <SearchIcon size={24} />
      </IconButton>
      <InputBase
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        placeholder="搜索番剧名称"
        sx={{ flex: 1, minWidth: 0, fontSize: 16, letterSpacing: '0.5px' }}
      />
      {input.length > 0 || query ? (
        <Tooltip title="清空搜索">
          <IconButton onClick={clearSearch} aria-label="清空搜索">
            <X size={24} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );

  const resultGrid = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: '12px',
        rowGap: '20px',
      }}
    >
      {bangumiResults.map((item) => (
        <KzSearchResultCard
          key={item.id}
          id={item.id}
          title={item.name_cn || item.name}
          coverUrl={item.images?.large || item.images?.common || item.images?.medium}
          score={item.rating?.score}
          year={(item.air_date || item.date || '').slice(0, 4)}
        />
      ))}
    </Box>
  );

  const resultSkeleton = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: '12px',
        rowGap: '20px',
      }}
    >
      {Array.from({ length: columns * 2 }).map((_, index) => (
        <Box key={index}>
          <Skeleton
            variant="rounded"
            sx={{ width: '100%', aspectRatio: '0.7', height: 'auto', borderRadius: '12px' }}
          />
          <Skeleton variant="text" sx={{ mt: '10px', height: 20 }} />
          <Skeleton variant="text" sx={{ width: '60%', height: 16 }} />
        </Box>
      ))}
    </Box>
  );

  const ruleList = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {ruleResults.map((item) => (
        <Card key={item.src} elevation={0} sx={{ borderRadius: '12px', overflow: 'hidden' }}>
          <ButtonBase
            onClick={() => void handlePlayRuleItem(item)}
            sx={{
              width: '100%',
              p: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              borderRadius: '12px',
              textAlign: 'left',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 16,
                  lineHeight: '24px',
                  fontWeight: 500,
                  color: theme.m3.onSurface,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </Typography>
              <Typography
                sx={{
                  mt: '2px',
                  fontSize: 12,
                  lineHeight: '16px',
                  color: theme.m3.onSurfaceVariant,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.src}
              </Typography>
            </Box>
            <Chip label={item.pluginName} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
          </ButtonBase>
        </Card>
      ))}
    </Box>
  );

  const ruleSkeleton = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={72} sx={{ borderRadius: '12px' }} />
      ))}
    </Box>
  );

  return (
    <Box sx={{ width: '100%', pb: 6 }}>
      {/* 顶栏（原版 SysAppBar title: 番剧搜索） */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: theme.m3.surface }}>
        <Box sx={{ px: `${horizontal}px` }}>
          <Box
            sx={{
              maxWidth: contentWidth,
              mx: 'auto',
              height: APP_BAR_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <IconButton onClick={() => navigate(-1)} aria-label="返回">
              <ArrowLeft size={24} />
            </IconButton>
            <Typography
              component="h1"
              sx={{ fontSize: 22, lineHeight: '28px', fontWeight: 500, color: theme.m3.onSurface }}
            >
              番剧搜索
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 搜索栏：有结果时 pinned（原版 pinSearch） */}
      {query ? (
        <Box
          sx={{
            position: 'sticky',
            top: APP_BAR_HEIGHT,
            zIndex: 19,
            bgcolor: theme.m3.surface,
            px: `${horizontal}px`,
            pt: '8px',
            pb: '16px',
          }}
        >
          <Box sx={{ maxWidth: contentWidth, mx: 'auto' }}>{searchField}</Box>
        </Box>
      ) : (
        <Box sx={{ px: `${horizontal}px`, pt: '24px', pb: '16px' }}>
          <Box sx={{ maxWidth: contentWidth, mx: 'auto' }}>{searchField}</Box>
        </Box>
      )}

      <Box sx={{ px: `${horizontal}px` }}>
        <Box sx={{ maxWidth: contentWidth, mx: 'auto' }}>
          {!query ? (
            /* 发现态：最近搜索（原版 _discovery） */
            history.length > 0 ? (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', px: '4px' }}>
                  <Typography
                    sx={{
                      flex: 1,
                      fontSize: 14,
                      lineHeight: '20px',
                      fontWeight: 500,
                      color: theme.m3.onSurfaceVariant,
                    }}
                  >
                    最近搜索
                  </Typography>
                  {managing ? (
                    <Button
                      onClick={clearHistory}
                      sx={{
                        minHeight: 32,
                        px: '12px',
                        fontSize: 14,
                        color: theme.m3.onSurfaceVariant,
                      }}
                    >
                      清空
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => setManaging((value) => !value)}
                    sx={{ minHeight: 32, px: '12px', fontSize: 14, color: theme.m3.primary }}
                  >
                    {managing ? '完成' : '管理'}
                  </Button>
                </Box>

                {history.map((keyword) => (
                  <ButtonBase
                    key={keyword}
                    onClick={() => submit(keyword)}
                    sx={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      px: '16px',
                      py: '12px',
                      borderRadius: '16px',
                      textAlign: 'left',
                      '&:hover': { backgroundColor: theme.palette.action.hover },
                    }}
                  >
                    <Clock size={22} color={theme.m3.onSurfaceVariant} />
                    <Typography
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 16,
                        lineHeight: '24px',
                        color: theme.m3.onSurface,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {keyword}
                    </Typography>
                    {managing ? (
                      <IconButton
                        size="small"
                        aria-label="删除这条搜索记录"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeHistory(keyword);
                        }}
                      >
                        <X size={20} />
                      </IconButton>
                    ) : (
                      <CornerUpLeft size={18} color={theme.m3.onSurfaceVariant} />
                    )}
                  </ButtonBase>
                ))}
              </Box>
            ) : (
              <EmptyPane icon={<SearchIcon size={40} />} title="输入番剧名称开始搜索" />
            )
          ) : (
            <>
              {/* 结果标题与统计（原版 _resultSlivers 头部） */}
              <Box sx={{ mb: '12px' }}>
                <Typography
                  sx={{
                    fontSize: 16,
                    lineHeight: '24px',
                    fontWeight: 500,
                    color: theme.m3.onSurface,
                  }}
                >
                  搜索结果
                </Typography>
                <Typography
                  sx={{ fontSize: 12, lineHeight: '16px', color: theme.m3.onSurfaceVariant }}
                >
                  {loading
                    ? '正在搜索…'
                    : `${activeTab === 0 ? ruleResults.length : bangumiResults.length} 个结果`}
                </Typography>
              </Box>

              <Tabs
                value={activeTab}
                onChange={(_, value: number) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons={false}
                allowScrollButtonsMobile
                sx={{
                  mb: '16px',
                  minHeight: 48,
                  '& .MuiTabs-list': { justifyContent: 'center' },
                  '& .MuiTabs-indicator': {
                    height: 3,
                    borderRadius: '3px 3px 0 0',
                    backgroundColor: theme.m3.primary,
                    transition: `transform ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, left ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, width ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}, background-color ${theme.motion.durations.medium}ms ${theme.motion.easings.standard}`,
                  },
                  '& .MuiTab-root': {
                    minHeight: 48,
                    px: '16px',
                    fontSize: 14,
                    fontWeight: 500,
                    color: theme.m3.onSurfaceVariant,
                    '&.Mui-selected': { color: theme.m3.primary },
                  },
                }}
              >
                <Tab label={`规则采集源 (${ruleResults.length})`} />
                <Tab label={`Bangumi 番剧库 (${bangumiResults.length})`} />
              </Tabs>

              {/* 面板切换 150ms 淡入 */}
              <Fade in appear key={activeTab} timeout={theme.motion.durations.fast}>
                <Box>
                  {activeTab === 0 ? (
                    loading && ruleResults.length === 0 ? (
                      ruleSkeleton
                    ) : ruleResults.length === 0 ? (
                      <EmptyPane icon={<SearchX size={40} />} title="暂无规则源搜索结果" />
                    ) : (
                      ruleList
                    )
                  ) : loading && bangumiResults.length === 0 ? (
                    resultSkeleton
                  ) : bangumiResults.length === 0 ? (
                    <EmptyPane icon={<SearchX size={40} />} title="没有找到番剧" />
                  ) : (
                    resultGrid
                  )}
                </Box>
              </Fade>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default SearchPage;
