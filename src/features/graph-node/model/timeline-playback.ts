import type { TimelineAnalysis, TimelineShot } from '@/shared/media/timeline-contracts';
import { nearestTimelineFrame } from '@/shared/media/timeline-editing';

export function shotPlaybackFrames(analysis: TimelineAnalysis, shot: TimelineShot): number[] {
  return analysis.frameTimesMs.filter((time) => time >= shot.startMs && time < shot.endMs);
}

/** Marker positions are media time, never an average-FPS or uniformly spaced frame estimate. */
export function timelineFrameAtPosition(frames: readonly number[], startMs: number, endMs: number, position: number): number {
  return nearestTimelineFrame(frames, startMs + Math.min(1, Math.max(0, position)) * (endMs - startMs));
}

export function timelineLoopTime(currentMs: number, startMs: number, endMs: number): number {
  return !Number.isFinite(currentMs) || currentMs < startMs || currentMs >= endMs ? startMs : currentMs;
}

export function timelineSpaceAllowed(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'defaultPrevented'>,
  nodeId: string | undefined, selectedNodeIds: readonly string[], isInteractiveTarget: boolean): boolean {
  return event.code === 'Space' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    && !event.defaultPrevented && !isInteractiveTarget && Boolean(nodeId)
    && selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId;
}
