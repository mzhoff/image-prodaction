import type { TimelineSnapshot } from '../contracts/story-timeline';
import { linkedTimelineIds } from './timeline-linked-clips';
import { timelineVideoPositions } from './timeline-video';

export function snapTimelineClip(snapshot: TimelineSnapshot, kind: 'video' | 'audio', id: string, requested: number, scale: number, enabled: boolean) {
  const clips = [...timelineVideoPositions(snapshot), ...(snapshot.audioClips ?? [])];
  const clip = clips.find((item) => item.id === id), excluded = linkedTimelineIds(snapshot, kind, id);
  const fps = snapshot.frameRate ?? 30;
  let startMs = Math.max(0, Math.round(Math.round(requested * fps / 1000) * 1000 / fps)), guideMs: number | null = null;
  if (!enabled || !clip) return { startMs, guideMs };
  let closest = 8 * 1000 / scale;
  const edges = [0, ...clips.filter((item) => !excluded.has(item.id)).flatMap((item) => [item.startMs, item.startMs + item.durationMs])];
  for (const edge of edges) for (const offset of [0, clip.durationMs]) {
    const candidate = edge - offset, distance = Math.abs(candidate - startMs);
    if (candidate >= 0 && distance < closest) { closest = distance; guideMs = edge; }
  }
  if (guideMs !== null) {
    const leading = guideMs, trailing = guideMs - clip.durationMs;
    startMs = trailing >= 0 && Math.abs(trailing - startMs) < Math.abs(leading - startMs) ? trailing : leading;
  }
  return { startMs, guideMs };
}
