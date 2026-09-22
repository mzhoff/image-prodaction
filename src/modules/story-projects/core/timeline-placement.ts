import type { TimelineSnapshot } from '../contracts/story-timeline';
import { linkedTimelineIds, moveLinkedTimelineClip, timelineClipLane } from './timeline-linked-clips';
import { PRIMARY_VIDEO_TRACK, timelineVideoPositions } from './timeline-video';

type Kind = 'video' | 'audio';
type Range = { startMs: number; durationMs: number };
const END = 7_200_000;

function laneClips(snapshot: TimelineSnapshot, kind: Kind, trackId: string) {
  return kind === 'video'
    ? timelineVideoPositions(snapshot).filter((clip) => (clip.trackId ?? PRIMARY_VIDEO_TRACK) === trackId)
    : (snapshot.audioClips ?? []).filter((clip) => (clip.trackId ?? clip.id) === trackId);
}

function obstaclesForMove(snapshot: TimelineSnapshot, kind: Kind, id: string, trackId: string) {
  const excluded = linkedTimelineIds(snapshot, kind, id);
  const obstacles: Range[] = laneClips(snapshot, kind, trackId).filter((clip) => !excluded.has(clip.id));
  const audio = snapshot.audioClips?.find((clip) => kind === 'audio' ? clip.id === id : clip.linkedVideoClipId === id);
  if (audio?.linkedVideoClipId) {
    const partnerKind = kind === 'video' ? 'audio' : 'video';
    const partnerId = kind === 'video' ? audio.id : audio.linkedVideoClipId;
    obstacles.push(...laneClips(snapshot, partnerKind, timelineClipLane(snapshot, partnerKind, partnerId)).filter((clip) => !excluded.has(clip.id)));
  }
  return obstacles;
}

function freeGaps(obstacles: Range[]) {
  const gaps: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (const clip of [...obstacles].sort((a, b) => a.startMs - b.startMs)) {
    if (clip.startMs > start) gaps.push({ start, end: clip.startMs });
    start = Math.max(start, clip.startMs + clip.durationMs);
  }
  if (start < END) gaps.push({ start, end: END });
  return gaps;
}

/** Stay in the current gap; when entering a lane, use the gap at the pointer or an adjacent edge. */
function fitInGap(obstacles: Range[], durationMs: number, requested: number, anchor?: number) {
  const gaps = freeGaps(obstacles), at = Math.max(0, Math.round(requested));
  if (anchor !== undefined) {
    const gap = gaps.find((gap) => anchor >= gap.start && anchor + durationMs <= gap.end);
    return gap ? Math.max(gap.start, Math.min(at, gap.end - durationMs)) : null;
  }
  const center = at + durationMs / 2;
  const underPointer = gaps.find((gap) => center >= gap.start && center <= gap.end);
  // A short gap stays unavailable; do not jump over its neighbours to a distant gap.
  const nearby = underPointer ? [underPointer] : [
    gaps.filter((gap) => gap.end < center).at(-1), gaps.find((gap) => gap.start > center),
  ];
  const candidates = nearby.filter((gap) => gap && gap.end - gap.start >= durationMs)
    .map((gap) => Math.max(gap!.start, Math.min(at, gap!.end - durationMs)));
  return candidates.sort((a, b) => Math.abs(a - at) - Math.abs(b - at))[0] ?? null;
}

/** Collision-free placement for a new material; no automatic trimming or overlapping. */
export function timelineInsertionStart(snapshot: TimelineSnapshot, kind: Kind, trackId: string, durationMs: number, requested: number) {
  return fitInGap(laneClips(snapshot, kind, trackId), durationMs, requested);
}

/** Clamps against both members' neighbours, independently of magnetic snapping. */
export function placeTimelineClip(snapshot: TimelineSnapshot, kind: Kind, id: string, trackId: string, requested: number, current = snapshot) {
  const clip = kind === 'video' ? timelineVideoPositions(current).find((clip) => clip.id === id) : current.audioClips?.find((clip) => clip.id === id);
  if (!clip) return null;
  const sameLane = timelineClipLane(current, kind, id) === trackId;
  const startMs = fitInGap(obstaclesForMove(snapshot, kind, id, trackId), clip.durationMs, requested, sameLane ? clip.startMs : undefined);
  return startMs === null ? null : { snapshot: moveLinkedTimelineClip(snapshot, kind, id, trackId, startMs), startMs };
}

/** A trim handle stops at the next clip, including neighbours of linked sound/picture. */
export function timelineClipDurationLimit(snapshot: TimelineSnapshot, kind: Kind, id: string) {
  const clip = kind === 'video' ? timelineVideoPositions(snapshot).find((clip) => clip.id === id) : snapshot.audioClips?.find((clip) => clip.id === id);
  if (!clip) return 100;
  const next = obstaclesForMove(snapshot, kind, id, timelineClipLane(snapshot, kind, id))
    .filter((item) => item.startMs >= clip.startMs + clip.durationMs).map((item) => item.startMs);
  return Math.min(kind === 'video' ? 600_000 : END, END - clip.startMs, ...next.map((at) => at - clip.startMs));
}
