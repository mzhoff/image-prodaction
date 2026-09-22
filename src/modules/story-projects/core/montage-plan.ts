import { selectionLayout } from './montage-selection-layout';
import { rhythmBoundaries } from './montage-rhythm';
import { timelineSnapshotSchema, type TimelineSnapshot } from '../contracts/story-timeline';
import { montageSelectionSchema, type MontageSlot, type MontageSource, type MusicAnalysis } from '../contracts/timeline-production';
import { timelineVideoPositions } from './timeline-video';

/** Adjusting the beat grid reuses decoded energy and scene descriptions. */
export function withManualBeatGrid(music: MusicAnalysis, bpm: number, offsetMs = 0): MusicAnalysis {
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240 || !Number.isInteger(offsetMs) || offsetMs < 0 || offsetMs >= music.durationMs) throw new Error('Неверные параметры сетки ритма.');
  const beatsMs = [];
  for (let time = offsetMs; time < music.durationMs; time += 60000 / bpm) beatsMs.push(Math.round(time));
  return { ...music, bpm, confidence: 1, beatsMs: beatsMs.filter((time) => time < music.durationMs), method: 'manual' };
}

export function makeMontageSlots(snapshot: TimelineSnapshot, music: MusicAnalysis): MontageSlot[] {
  const settings = snapshot.production;
  if (!settings || !music.bpm || music.confidence < 0.25 || music.beatsMs.length < 2) throw new Error('Ритм не определён уверенно. Укажите BPM и начало первого удара.');
  if (music.durationMs !== settings.targetDurationMs) throw new Error('Музыка проанализирована для другой длительности.');
  const fps = snapshot.frameRate ?? 30, frames = Math.floor(settings.targetDurationMs * fps / 1000);
  const quantize = (ms: number) => Math.round(ms * fps / 1000);
  const at = (frame: number) => Math.round(frame * 1000 / fps);
  const energyAt = (ms: number) => music.energy.reduce((nearest, point) => Math.abs(point.timeMs - ms) < Math.abs(nearest.timeMs - ms) ? point : nearest, music.energy[0] ?? { timeMs: 0, value: 0 }).value;
  const locks = timelineVideoPositions(snapshot).filter((clip) => !clip.trackId).filter((clip) => snapshot.lockedClipIds?.includes(clip.id));
  if (locks.some((clip) => clip.startMs + clip.durationMs > at(frames))) throw new Error('Закреплённый клип выходит за новую длительность.');
  const boundaries = rhythmBoundaries({ pacing: settings.pacing, music, frames, fps, energyAt });
  // A fixed placement is an indivisible cell. Its exact milliseconds are retained below.
  for (const clip of locks) {
    for (const frame of boundaries) if (frame > quantize(clip.startMs) && frame < quantize(clip.startMs + clip.durationMs)) boundaries.delete(frame);
    boundaries.add(quantize(clip.startMs)); boundaries.add(quantize(clip.startMs + clip.durationMs));
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const peak = music.energy.reduce((best, point) => point.value > best.value ? point : best, { timeMs: settings.targetDurationMs * 0.75, value: -1 }).timeMs;
  const slots: MontageSlot[] = sorted.slice(0, -1).map((frame, index) => {
    let startMs = at(frame), endMs = at(sorted[index + 1]);
    const locked = locks.find((clip) => quantize(clip.startMs) === frame && quantize(clip.startMs + clip.durationMs) === sorted[index + 1]);
    const startLock = locks.find((clip) => quantize(clip.startMs + clip.durationMs) === frame);
    const endLock = locks.find((clip) => quantize(clip.startMs) === sorted[index + 1]);
    if (startLock) startMs = startLock.startMs + startLock.durationMs;
    if (endLock) endMs = endLock.startMs;
    if (locked) { startMs = locked.startMs; endMs = locked.startMs + locked.durationMs; }
    return { id: `slot-${index + 1}`, startMs, durationMs: endMs - startMs, energy: energyAt(startMs),
      role: index === 0 ? 'opening' : index === sorted.length - 2 ? 'ending' : Math.abs(startMs - peak) < 3000 ? 'climax' : 'build',
      ...(locked ? { lockedClipId: locked.id } : {}) };
  });
  if (slots.some((slot) => slot.durationMs < 100)) throw new Error('Закреплённый клип оставляет слишком короткий промежуток. Скорректируйте его положение.');
  return slots;
}

export function applyMontageSelections(input: {
  snapshot: TimelineSnapshot; sources: MontageSource[]; slots: MontageSlot[]; selections: unknown; music: MusicAnalysis; createId(): string;
}): TimelineSnapshot {
  const layout = selectionLayout(input.slots, montageSelectionSchema.parse(input.selections));
  const used: { assetId: string; start: number; end: number }[] = input.snapshot.clips.filter((c) => !c.trackId && input.snapshot.lockedClipIds?.includes(c.id)).map((c) => ({ assetId: c.assetId, start: c.sourceInMs, end: c.sourceInMs + c.durationMs }));
  const clips = input.slots.filter((slot) => slot.lockedClipId || layout.has(slot.id)).map((slot) => {
    if (slot.lockedClipId) return input.snapshot.clips.find((clip) => clip.id === slot.lockedClipId)!;
    const { selection, durationMs } = layout.get(slot.id)!;
    const source = input.sources.find((candidate) => candidate.id === selection.sourceId);
    const end = selection.sourceInMs + durationMs;
    if (!source || selection.sourceInMs < source.startMs || end > source.endMs) throw new Error('Модель выбрала недоступный диапазон исходника.');
    if (used.some((range) => range.assetId === source.assetId && selection.sourceInMs < range.end && end > range.start)) throw new Error('Модель повторно использовала один и тот же участок исходника.');
    used.push({ assetId: source.assetId, start: selection.sourceInMs, end });
    return { id: input.createId(), shotId: null, assetId: source.assetId, kind: 'video' as const, sourceInMs: selection.sourceInMs, durationMs, startMs: slot.startMs };
  });
  const durationMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0);
  const audioTracks = input.snapshot.audioTracks ? [...input.snapshot.audioTracks] : undefined;
  const retainedVideoIds = new Set([...clips, ...input.snapshot.clips.filter((clip) => clip.trackId)].map((clip) => clip.id));
  const retainedAudio = (input.snapshot.audioClips ?? []).filter((clip) => clip.role !== 'music' && (!clip.linkedVideoClipId || retainedVideoIds.has(clip.linkedVideoClipId)));
  let musicTrackId: string | undefined;
  if (audioTracks) {
    musicTrackId = audioTracks.find((track) => !retainedAudio.some((clip) => clip.trackId === track.id))?.id;
    if (!musicTrackId) { musicTrackId = input.createId(); audioTracks.push({ id: musicTrackId, name: 'Music' }); }
  }
  return timelineSnapshotSchema.parse({ ...input.snapshot, ...(audioTracks ? { audioTracks } : {}), clips: [...clips, ...input.snapshot.clips.filter((clip) => clip.trackId)], sourceAudioGain: input.snapshot.sourceAudioGain ?? 0,
    audioClips: [...retainedAudio,
      { id: input.createId(), ...(musicTrackId ? { trackId: musicTrackId } : {}), assetId: input.music.assetId, startMs: 0, sourceInMs: input.music.sourceInMs, durationMs, gain: 1, role: 'music' }],
  });
}
