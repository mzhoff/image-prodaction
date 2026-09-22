import { timelineSnapshotSchema, type TimelineSnapshot } from '../contracts/story-timeline';
import { moveVideoClip, timelineVideoPositions, PRIMARY_VIDEO_TRACK } from './timeline-video';
import { moveAudioClip } from './timeline-track-editing';

/** A linked pair is one edit, whether the user starts from its picture or its sound. */
export function synchronizeTimelineLinks(before: TimelineSnapshot, after: TimelineSnapshot): TimelineSnapshot {
  let clips = after.clips, audioClips = after.audioClips;
  const oldPositions = timelineVideoPositions(before);
  for (const oldAudio of before.audioClips ?? []) {
    if (!oldAudio.linkedVideoClipId) continue;
    const oldVideo = oldPositions.find((clip) => clip.id === oldAudio.linkedVideoClipId);
    const audio = audioClips?.find((clip) => clip.id === oldAudio.id);
    const video = timelineVideoPositions({ clips }).find((clip) => clip.id === oldAudio.linkedVideoClipId);
    if (audio && !audio.linkedVideoClipId) continue; // Explicit unlink keeps both fragments.
    if (!video) { audioClips = audioClips?.filter((clip) => clip.id !== oldAudio.id); continue; }
    if (!audio) { clips = clips.filter((clip) => clip.id !== video.id); continue; }
    if (!oldVideo) continue;
    const videoChanged = video.startMs !== oldVideo.startMs || video.sourceInMs !== oldVideo.sourceInMs || video.durationMs !== oldVideo.durationMs;
    if (videoChanged) audioClips = audioClips?.map((clip) => clip.id === audio.id ? { ...clip, startMs: video.startMs, sourceInMs: video.sourceInMs, durationMs: video.durationMs } : clip);
    else if (audio.startMs !== oldAudio.startMs || audio.sourceInMs !== oldAudio.sourceInMs || audio.durationMs !== oldAudio.durationMs) {
      clips = timelineVideoPositions({ clips }).map((clip) => clip.id === video.id ? { ...clip, startMs: audio.startMs, sourceInMs: audio.sourceInMs, durationMs: audio.durationMs } : clip);
    }
  }
  return { ...after, clips, ...(audioClips ? { audioClips } : {}), ...(after.lockedClipIds ? { lockedClipIds: after.lockedClipIds.filter((id) => clips.some((clip) => clip.id === id)) } : {}) };
}

export function moveLinkedTimelineClip(snapshot: TimelineSnapshot, kind: 'video' | 'audio', id: string, trackId: string, startMs: number) {
  const next = kind === 'video' ? moveVideoClip(snapshot, id, trackId, startMs) : moveAudioClip(snapshot, id, trackId, startMs);
  return timelineSnapshotSchema.parse(synchronizeTimelineLinks(snapshot, next));
}

export function unlinkTimelineClip(snapshot: TimelineSnapshot, kind: 'video' | 'audio', id: string): TimelineSnapshot {
  return { ...snapshot, audioClips: snapshot.audioClips?.map((clip) => {
    if (kind === 'audio' ? clip.id !== id : clip.linkedVideoClipId !== id) return clip;
    const { linkedVideoClipId: _link, ...independent } = clip; return independent;
  }) };
}

export function linkedTimelineIds(snapshot: TimelineSnapshot, kind: 'video' | 'audio', id: string) {
  const audio = snapshot.audioClips?.find((clip) => kind === 'audio' ? clip.id === id : clip.linkedVideoClipId === id);
  return new Set([id, ...(audio?.linkedVideoClipId ? [audio.id, audio.linkedVideoClipId] : [])]);
}

/** Attach the verified, full-length audio derivative without playing the embedded sound twice. */
export function attachTimelineAudio(snapshot: TimelineSnapshot, videoId: string, audioAssetId: string, createId: () => string): TimelineSnapshot {
  const video = timelineVideoPositions(snapshot).find((clip) => clip.id === videoId && clip.kind === 'video');
  if (!video || snapshot.audioClips?.some((clip) => clip.linkedVideoClipId === videoId)) return snapshot;
  const lane = snapshot.audioTracks?.find((track) => !(snapshot.audioClips ?? []).some((clip) => clip.trackId === track.id && clip.startMs < video.startMs + video.durationMs && clip.startMs + clip.durationMs > video.startMs));
  const trackId = lane?.id ?? createId();
  return timelineSnapshotSchema.parse({ ...snapshot,
    clips: snapshot.clips.map((clip) => clip.id === videoId ? { ...clip, sourceAudioMuted: true } : clip),
    audioTracks: lane ? snapshot.audioTracks : [...(snapshot.audioTracks ?? []), { id: trackId, name: `Звук видео ${(snapshot.audioTracks?.length ?? 0) + 1}` }],
    audioClips: [...(snapshot.audioClips ?? []), { id: createId(), assetId: audioAssetId, trackId, linkedVideoClipId: videoId, allowSilentTail: true, startMs: video.startMs, sourceInMs: video.sourceInMs, durationMs: video.durationMs, gain: snapshot.sourceAudioGain ?? 1, role: 'effect' }],
  });
}

export const timelineClipLane = (snapshot: TimelineSnapshot, kind: 'video' | 'audio', id: string) => kind === 'video'
  ? snapshot.clips.find((clip) => clip.id === id)?.trackId ?? PRIMARY_VIDEO_TRACK
  : snapshot.audioClips?.find((clip) => clip.id === id)?.trackId ?? id;
