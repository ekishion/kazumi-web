/**
 * 滚动动画工具：对齐原版 `scrollController.animateTo(0, duration: 350ms, curve: Curves.easeOut)`
 * （Kazumi/lib/pages/popular/popular_page.dart:118-122）
 */

/** Flutter Curves.easeOut 的近似（三次贝塞尔 0,0,0.2,1） */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function animateScrollTo(
  el: HTMLElement | null,
  target: number,
  duration = 350,
): void {
  if (!el) return;
  const start = el.scrollTop;
  const delta = target - start;
  if (Math.abs(delta) < 1) {
    el.scrollTop = target;
    return;
  }

  const startTime = performance.now();
  const step = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    el.scrollTop = start + delta * easeOut(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const scrollUtils = { animateScrollTo };
