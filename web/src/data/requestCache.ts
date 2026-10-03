/**
 * 轻量请求缓存：解决 Web 版"切标签页重新请求 → 骨架闪烁 → 滚动丢失"的连续性问题。
 *
 * 原版把列表数据放在 controller 里跨页面存活
 * （Kazumi/lib/pages/popular/popular_controller.dart，trendList 缓存 + scrollOffset 恢复），
 * 因此切换标签页不会重新请求。Web 侧用本模块达到同样效果。
 */

interface Entry<T> {
  promise: Promise<T>;
  data?: T;
  updatedAt: number;
}

const store = new Map<string, Entry<unknown>>();

const DEFAULT_TTL = 5 * 60 * 1000;

/** 读取缓存（同步，用于首屏直接渲染、避免骨架）。 */
export function peek<T>(key: string, ttlMs: number = DEFAULT_TTL): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry || entry.data === undefined) return undefined;
  if (Date.now() - entry.updatedAt > ttlMs) return undefined;
  return entry.data;
}

/** 带缓存与并发去重的请求。 */
export function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL,
): Promise<T> {
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing) {
    if (existing.data !== undefined && Date.now() - existing.updatedAt <= ttlMs) {
      return Promise.resolve(existing.data);
    }
    if (existing.data === undefined) {
      // 请求进行中，复用同一个 Promise
      return existing.promise;
    }
  }

  const promise = fetcher()
    .then((data) => {
      store.set(key, { promise, data, updatedAt: Date.now() });
      return data;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });

  store.set(key, { promise, updatedAt: Date.now() });
  return promise;
}

/** 失效缓存：不传前缀则清空全部。 */
export function invalidate(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export const requestCache = { peek, cached, invalidate };
