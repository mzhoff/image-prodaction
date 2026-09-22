import { analyzeMusicBytes } from '@/shared/media/music-processor';
import type { RenderMedia } from '@/shared/media/montage-render';
import { makeMontageSlots, withManualBeatGrid } from '@/modules/story-projects/core/montage-plan';
import type { MontagePayload } from './montage-contracts';
import { analyzeMontage } from './montage-analysis';

/** No provider import/call: preparing cells and correcting BPM is local computation. */
export async function prepareMontageRhythm(payload: MontagePayload, load: (id: string) => Promise<RenderMedia>, signal: AbortSignal) {
  const request = payload.request, settings = payload.snapshot.production;
  if (request.action !== 'rhythm' || !settings) throw new Error('Отсутствуют параметры ритма.');
  let music = payload.music;
  if (!music) {
    const media = await load(request.musicAssetId);
    try {
      music = { version: 1, assetId: request.musicAssetId, checksum: payload.checksums[request.musicAssetId], sourceInMs: request.musicSourceInMs, durationMs: settings.targetDurationMs,
        ...await analyzeMusicBytes({ bytes: media.bytes, sourceInMs: request.musicSourceInMs, durationMs: settings.targetDurationMs, bpm: request.bpm, beatOffsetMs: request.beatOffsetMs, signal }) };
    } finally { await media.dispose?.(); }
  }
  if (request.bpm || request.beatOffsetMs) {
    if (!music.bpm && !request.bpm) throw new Error('Для смещения неопределённого ритма укажите BPM.');
    music = withManualBeatGrid(music, request.bpm ?? music.bpm!, request.beatOffsetMs);
  }
  return { kind: 'grid' as const, music, slots: makeMontageSlots(payload.snapshot, music) };
}

export async function analyzeForMontagePlan(input: Parameters<typeof analyzeMontage>[0], analyze = analyzeMontage) {
  const { payload } = input, request = payload.request;
  if (request.action !== 'plan' || !payload.music || !payload.slots) throw new Error('Сначала подготовьте ячейки.');
  const analysis = input.previous ?? payload.analysis ?? { version: 1 as const, complete: false, sources: [], completedAssetIds: [], music: payload.music };
  return analyze({ ...input, previous: { ...analysis, music: payload.music }, payload: { ...payload,
    request: { action: 'analyze', model: request.model, expectedRevision: request.expectedRevision, idempotencyKey: request.idempotencyKey,
      musicAssetId: payload.music.assetId, musicSourceInMs: payload.music.sourceInMs, beatOffsetMs: 0 },
  } });
}
