/** Keep the playhead on a visible output frame, including non-integral frame durations. */
export function lastTimelineFrame(durationMs: number, fps: number) {
  return Math.max(0, Math.ceil(durationMs * fps / 1000 - 1e-7) - 1) * 1000 / fps;
}
export function timelineSeekTime(timeMs: number, durationMs: number, fps: number) {
  return Math.max(0, Math.min(lastTimelineFrame(durationMs, fps), Math.round(timeMs * fps / 1000) * 1000 / fps));
}
export function timelineFrameStep(timeMs: number, direction: -1 | 1, durationMs: number, fps: number) {
  return timelineSeekTime((Math.round(timeMs * fps / 1000) + direction) * 1000 / fps, durationMs, fps);
}
export function timelineSceneStep(timeMs: number, direction: -1 | 1, starts: number[], durationMs: number, fps: number) {
  const boundaries = starts.map((time) => Math.max(0, Math.ceil(time * fps / 1000 - 1e-7)) * 1000 / fps);
  return direction === 1 ? boundaries.find((time) => time > timeMs + 0.01) ?? lastTimelineFrame(durationMs, fps)
    : boundaries.findLast((time) => time < timeMs - 0.01) ?? 0;
}
export function timelineTimecode(timeMs: number, fps: number) {
  const frame = Math.max(0, Math.round(timeMs * fps / 1000)), seconds = Math.floor(frame / fps);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frame % fps].map((value) => String(value).padStart(2, '0')).join(':');
}
