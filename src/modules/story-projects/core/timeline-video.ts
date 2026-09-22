import type { TimelineSnapshot } from '../contracts/story-timeline';

export type TimelineClip = TimelineSnapshot['clips'][number];
export const PRIMARY_VIDEO_TRACK = 'primary';
/** Legacy sequences remain readable; editing materializes absolute positions on every lane. */
export function timelineVideoPositions(snapshot: Pick<TimelineSnapshot, 'clips'>) {
  let at = 0;
  return snapshot.clips.map((clip) => {
    if (clip.trackId) return { ...clip, startMs: clip.startMs! };
    const startMs = clip.startMs ?? at; at = startMs + clip.durationMs; return { ...clip, startMs };
  });
}
export function timelineVideoDuration(snapshot: Pick<TimelineSnapshot, 'clips'>) {
  return Math.max(0, ...timelineVideoPositions(snapshot).map((clip) => clip.startMs + clip.durationMs));
}
export function timelineVideoLanes(snapshot: TimelineSnapshot) {
  return [{ id: PRIMARY_VIDEO_TRACK, name: 'Видео' }, ...(snapshot.videoTracks ?? [])];
}
export type TimelineVideoSegment = { id: string; startMs: number; durationMs: number; sourceInMs: number; shotId: null; assetId: string; kind: 'video' | 'image' | 'gap'; sourceAudioMuted?: boolean };
/** Full-frame cuts: last lane is above earlier lanes. Empty regions produce black frames. */
export function timelineVideoSegments(snapshot: TimelineSnapshot): TimelineVideoSegment[] {
  const positions = timelineVideoPositions(snapshot);
  const rank = (clip: TimelineClip) => clip.trackId ? (snapshot.videoTracks?.findIndex((track) => track.id === clip.trackId) ?? -1) + 1 : 0;
  const sorted = [...positions].sort((a, b) => rank(b) - rank(a));
  const end = Math.max(0, ...positions.map((clip) => clip.startMs + clip.durationMs), ...(snapshot.audioClips ?? []).map((clip) => clip.startMs + clip.durationMs));
  const edges = [...new Set([0, end, ...positions.flatMap((clip) => [clip.startMs, clip.startMs + clip.durationMs])])].sort((a, b) => a - b);
  const result: TimelineVideoSegment[] = [];
  for (let index = 0; index < edges.length - 1; index++) {
    const startMs = edges[index], durationMs = edges[index + 1] - startMs;
    const clip = sorted.find((item) => item.startMs <= startMs && item.startMs + item.durationMs > startMs);
    const id = clip?.id ?? 'gap', previous = result.at(-1);
    if (previous?.id === id && previous.startMs + previous.durationMs === startMs) { previous.durationMs += durationMs; continue; }
    result.push({ id, shotId: null, startMs, durationMs, kind: clip?.kind ?? 'gap', assetId: clip?.assetId ?? '', sourceInMs: clip?.kind === 'video' ? clip.sourceInMs + startMs - clip.startMs : 0, ...(clip?.sourceAudioMuted ? { sourceAudioMuted: true } : {}) });
  }
  return result;
}
export function moveVideoClip(snapshot: TimelineSnapshot, id: string, trackId: string, startMs: number): TimelineSnapshot {
  const clip = snapshot.clips.find((item) => item.id === id);
  if (!clip || !timelineVideoLanes(snapshot).some((track) => track.id === trackId)) throw new Error('Видеодорожка не найдена.');
  const rest = timelineVideoPositions(snapshot).filter((item) => item.id !== id);
  const lane = trackId === PRIMARY_VIDEO_TRACK ? undefined : trackId;
  const at = Math.max(0, Math.round(startMs));
  if (rest.some((item) => item.trackId === lane && at < item.startMs + item.durationMs && at + clip.durationMs > item.startMs)) throw new Error('Здесь уже есть клип. Выберите свободное место или другую видеодорожку.');
  return { ...snapshot, clips: [...rest, { ...clip, trackId: lane, startMs: at }] };
}
export function reorderPrimaryClips(clips: TimelineClip[], id: string, destination: number): TimelineClip[] {
  const primary = timelineVideoPositions({ clips }).filter((clip) => !clip.trackId).sort((a, b) => a.startMs - b.startMs), from = primary.findIndex((clip) => clip.id === id);
  if (from < 0 || destination < 0 || destination >= primary.length) return clips;
  const [clip] = primary.splice(from, 1); primary.splice(destination, 0, clip);
  let at = 0;
  return [...primary.map((clip) => { const startMs = at; at += clip.durationMs; return { ...clip, startMs }; }), ...clips.filter((clip) => clip.trackId)];
}

/** Imports append after the last primary clip, even after the user reordered the array by dragging. */
export function appendTimelineClips(snapshot: TimelineSnapshot, added: TimelineClip[]): TimelineSnapshot {
  const clips = timelineVideoPositions(snapshot);
  let at = Math.max(0, ...clips.filter((clip) => !clip.trackId).map((clip) => clip.startMs + clip.durationMs));
  return { ...snapshot, clips: [...clips, ...added.map((clip) => { const startMs = at; at += clip.durationMs; return { ...clip, startMs }; })] };
}
