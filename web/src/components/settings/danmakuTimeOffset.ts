/**
 * 弹幕时间校准文案：对齐原版 `Kazumi/lib/pages/settings/danmaku/danmaku_time_offset_sheet.dart`
 * （`formatDanmakuTimeOffset`：0 显示“无偏移”语义，其余显示 提前/延后 mm:ss）。
 */
export function formatDanmakuTimeOffset(value: number): string {
  if (!value) return '与视频同步';
  const total = Math.round(Math.abs(value));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${value > 0 ? '延后' : '提前'} ${minutes}:${seconds}`;
}

export default formatDanmakuTimeOffset;
