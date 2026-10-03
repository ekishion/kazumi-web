import React, { createContext, useContext } from 'react';

/**
 * 页面滚动容器上下文。
 *
 * 原版每个页面拥有自己的 ScrollController（如 PopularPage 的 scrollController，
 * 并把 offset 存进 controller 以便返回时恢复）。Web 侧由外壳为每个常驻标签页
 * 提供一个独立的滚动容器，页面通过本上下文拿到它做滚动监听 / 回到顶部。
 */
export type PageScrollRef = React.RefObject<HTMLDivElement | null>;

export const PageScrollContext = createContext<PageScrollRef | null>(null);

/** 取当前页面的滚动容器 ref（`.current` 在挂载后可用） */
export function usePageScroll(): PageScrollRef | null {
  return useContext(PageScrollContext);
}

export default PageScrollContext;
