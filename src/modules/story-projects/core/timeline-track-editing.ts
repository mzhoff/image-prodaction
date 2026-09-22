import type { TimelineSnapshot } from '../contracts/story-timeline';
import type { MontageSlot } from '../contracts/timeline-production';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';

export function timelineAudioLanes(snapshot: TimelineSnapshot) {
  return [...(snapshot.audioTracks ?? []), ...(snapshot.audioClips ?? []).filter((clip) => !clip.trackId)
    .map((clip, index) => ({ id: clip.id, name: `Аудио ${index + 1}` }))];
}

/** Materialize legacy one-clip lanes only when the user starts editing tracks. */
export function normalizeAudioLanes(snapshot: TimelineSnapshot): TimelineSnapshot {
  return { ...snapshot, audioTracks: timelineAudioLanes(snapshot),
    audioClips: (snapshot.audioClips ?? []).map((clip) => ({ ...clip, trackId: clip.trackId ?? clip.id })) };
}

export function moveAudioClip(snapshot: TimelineSnapshot, id: string, trackId: string, startMs: number): TimelineSnapshot {
  const next = normalizeAudioLanes(snapshot), clip = next.audioClips?.find((item) => item.id === id);
  if (!clip || !next.audioTracks?.some((track) => track.id === trackId)) throw new Error('Дорожка не найдена.');
  const duration = 7_200_000;
  const start = Math.max(0, Math.min(Math.round(startMs), duration - clip.durationMs));
  if (next.audioClips?.some((item) => item.id !== id && item.trackId === trackId && start < item.startMs + item.durationMs && start + clip.durationMs > item.startMs)) throw new Error('Здесь уже есть звук. Сдвиньте фрагмент или выберите другую дорожку.');
  return { ...next, audioClips: next.audioClips!.map((item) => item.id === id ? { ...item, trackId, startMs: start } : item) };
}

/** Keep short scenes attached to their neighbour instead of dropping source frames. */
export function clipsFromScenes(analysis: TimelineAnalysis, createId: () => string): TimelineSnapshot['clips'] {
  const ranges: { startMs: number; endMs: number }[] = [];
  let startMs = 0;
  for (const shot of analysis.shots) {
    const endMs = Math.round(shot.endMs);
    if (endMs - startMs < 100) continue;
    ranges.push({ startMs, endMs }); startMs = endMs;
  }
  if (ranges.length && startMs < Math.round(analysis.durationMs)) ranges[ranges.length - 1].endMs = Math.round(analysis.durationMs);
  return ranges.map((range) => ({ id: createId(), shotId: null, assetId: analysis.sourceAssetId, kind: 'video', sourceInMs: range.startMs, durationMs: range.endMs - range.startMs }));
}

export function reviewMontageSlots(original: MontageSlot[], reviewed: MontageSlot[]): MontageSlot[] {
  if (!original.length) throw new Error('Сетка ещё не подготовлена.');
  const end = (slot: MontageSlot) => slot.startMs + slot.durationMs;
  if (!reviewed.length || reviewed.length > 100 || new Set(reviewed.map((slot) => slot.id)).size !== reviewed.length
    || reviewed[0].startMs !== 0 || end(reviewed.at(-1)!) !== end(original.at(-1)!)
    || reviewed.some((slot, index) => slot.durationMs < 100 || (index > 0 && slot.startMs !== end(reviewed[index - 1])))) throw new Error('Ячейки должны покрывать весь ролик без пропусков и пересечений.');
  const locks = original.filter((slot) => slot.lockedClipId);
  if (locks.some((lock) => !reviewed.some((slot) => slot.lockedClipId === lock.lockedClipId && slot.startMs === lock.startMs && slot.durationMs === lock.durationMs))
    || reviewed.filter((slot) => slot.lockedClipId).length !== locks.length
    || reviewed.some((slot) => slot.lockedClipId && !locks.some((lock) => lock.lockedClipId === slot.lockedClipId && lock.startMs === slot.startMs && lock.durationMs === slot.durationMs))) throw new Error('Закреплённые фрагменты нельзя перемещать через сетку ритма.');
  return reviewed;
}

export function resizeMontageBoundary(slots: MontageSlot[], index: number, endMs: number, fps: number): MontageSlot[] {
  const left = slots[index], right = slots[index + 1];
  if (!left || !right || left.lockedClipId || right.lockedClipId) return slots;
  const end = Math.max(left.startMs + 100, Math.min(right.startMs + right.durationMs - 100, Math.round(Math.round(endMs * fps / 1000) * 1000 / fps)));
  return slots.map((slot, i) => i === index ? { ...slot, durationMs: end - slot.startMs }
    : i === index + 1 ? { ...slot, startMs: end, durationMs: slot.startMs + slot.durationMs - end } : slot);
}
