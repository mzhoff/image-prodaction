import { timelineSnapshotSchema, type TimelineSnapshot } from '../contracts/story-timeline';
import { normalizeAudioLanes } from './timeline-track-editing';
import { timelineVideoPositions } from './timeline-video';

export function splitTimelineClip(snapshot: TimelineSnapshot, kind: 'video' | 'audio', id: string, timeMs: number, createId: () => string) {
  const at = Math.round(Math.round(timeMs * (snapshot.frameRate ?? 30) / 1000) * 1000 / (snapshot.frameRate ?? 30));
  const position = kind === 'video' ? timelineVideoPositions(snapshot).find((clip) => clip.id === id) : snapshot.audioClips?.find((clip) => clip.id === id);
  if (!position) throw new Error('Выберите клип для разреза.');
  const first = at - position.startMs, second = position.durationMs - first;
  if (first < 100 || second < 100) throw new Error('Поставьте иглу внутри клипа: с каждой стороны должно остаться не меньше 0,1 секунды.');
  const newId = createId();
  const linkedAudio = snapshot.audioClips?.find((clip) => kind === 'video' ? clip.linkedVideoClipId === id : clip.id === id && clip.linkedVideoClipId);
  if (linkedAudio) {
    const videoId = linkedAudio.linkedVideoClipId!, secondVideoId = kind === 'video' ? newId : createId(), secondAudioId = kind === 'audio' ? newId : createId();
    const next = normalizeAudioLanes(snapshot);
    return timelineSnapshotSchema.parse({ ...next,
      clips: timelineVideoPositions(next).flatMap((clip) => clip.id !== videoId ? [clip] : [
        { ...clip, durationMs: first }, { ...clip, id: secondVideoId, startMs: at, sourceInMs: clip.sourceInMs + first, durationMs: second },
      ]),
      audioClips: next.audioClips!.flatMap((clip) => clip.id !== linkedAudio.id ? [clip] : [
        { ...clip, durationMs: first }, { ...clip, id: secondAudioId, linkedVideoClipId: secondVideoId, startMs: at, sourceInMs: clip.sourceInMs + first, durationMs: second },
      ]), ...(snapshot.lockedClipIds?.includes(videoId) ? { lockedClipIds: [...snapshot.lockedClipIds, secondVideoId] } : {}),
    });
  }
  if (kind === 'audio') {
    const next = normalizeAudioLanes(snapshot);
    return timelineSnapshotSchema.parse({ ...next, audioClips: next.audioClips!.flatMap((clip) => clip.id !== id ? [clip] : [
      { ...clip, durationMs: first }, { ...clip, id: newId, startMs: at, sourceInMs: clip.sourceInMs + first, durationMs: second },
    ]) });
  }
  return timelineSnapshotSchema.parse({ ...snapshot, clips: snapshot.clips.flatMap((clip) => clip.id !== id ? [clip] : [
    { ...clip, durationMs: first }, { ...clip, id: newId, ...(clip.startMs !== undefined ? { startMs: at } : {}), sourceInMs: clip.kind === 'image' ? 0 : clip.sourceInMs + first, durationMs: second },
  ]), ...(snapshot.lockedClipIds?.includes(id) ? { lockedClipIds: [...snapshot.lockedClipIds, newId] } : {}) });
}
