import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { createUuidV7 } from '@/shared/lib/id';

export function timelineWithMusic(snapshot: TimelineSnapshot, asset: { id: string; audio?: { durationSeconds: number } }): TimelineSnapshot {
  const durationMs = Math.min(180_000, Math.floor((asset.audio?.durationSeconds ?? 0) * 1000));
  if (!Number.isFinite(durationMs) || durationMs < 5000) throw new Error('Выберите трек длительностью от 5 секунд.');
  const production = snapshot.production ?? { purpose: 'promo' as const, brief: 'Собрать промо-ролик: вступление, развитие, кульминация и финал.', pacing: 'mixed' as const, sourceAssetIds: [] };
  return { ...snapshot, production: { ...production, targetDurationMs: durationMs },
    audioClips: [...(snapshot.audioClips ?? []).filter((clip) => clip.role !== 'music'), { id: createUuidV7(), assetId: asset.id, startMs: 0, sourceInMs: 0, durationMs, gain: 1, role: 'music' }] };
}
export function promoParameters(snapshot: TimelineSnapshot, musicId: string) {
  const p = snapshot.production!;
  return JSON.stringify({ brief: p.brief, seconds: p.targetDurationMs / 1000, pacing: p.pacing, sources: p.sourceAssetIds, musicId, sourceIn: 0, offset: 0, bpm: '' });
}
