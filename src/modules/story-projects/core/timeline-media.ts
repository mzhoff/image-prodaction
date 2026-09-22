import type { TimelineSnapshot } from '../contracts/story-timeline';
import { clipAssetRequirements } from './story-editing';

export function timelineAssetRequirements(snapshot: TimelineSnapshot) {
  return [...clipAssetRequirements(snapshot.clips), ...(snapshot.audioClips ?? []).map((clip) => ({
    id: clip.assetId, kind: 'audio' as const, endMs: clip.sourceInMs + clip.durationMs, ...(clip.allowSilentTail ? { allowSilentTail: true } : {}),
  })), ...(snapshot.production?.sourceAssetIds ?? []).map((id) => ({ id, kind: 'video' as const }))];
}

/** An older client may omit new fields. Explicit []/0 still clears or mutes them. */
export function mergeTimelineWrite(current: TimelineSnapshot, incoming: TimelineSnapshot): TimelineSnapshot {
  if (current.videoTracks?.length && incoming.videoTracks === undefined) {
    const layers = current.clips.filter((clip) => clip.trackId), ids = new Set(layers.map((clip) => clip.id));
    incoming = { ...incoming, videoTracks: current.videoTracks, clips: [...incoming.clips.filter((clip) => !ids.has(clip.id)), ...layers], lockedClipIds: [...new Set([...(incoming.lockedClipIds ?? current.lockedClipIds ?? []), ...(current.lockedClipIds ?? []).filter((id) => ids.has(id))])] };
  }
  const lockedClipIds = (incoming.lockedClipIds ?? current.lockedClipIds)?.filter((id) => incoming.clips.some((clip) => clip.id === id));
  return { ...current, ...incoming, ...(lockedClipIds ? { lockedClipIds } : {}) };
}
