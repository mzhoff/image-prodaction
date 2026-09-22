import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { emptyTimeline } from '../contracts/story-timeline';
import { montageJobRequestSchema, type MusicAnalysis } from '../contracts/timeline-production';
import { makeMontageSlots } from './montage-plan';
import { prepareMontageRhythm } from '@/modules/generation/server/montage-rhythm';
import { selectionLayout } from './montage-selection-layout';

const music: MusicAnalysis = { version: 1, assetId: randomUUID(), checksum: 'a'.repeat(64), sourceInMs: 0, durationMs: 60_000, bpm: 120, confidence: 1,
  beatsMs: Array.from({ length: 120 }, (_, index) => index * 500), energy: [{ timeMs: 0, value: 0.2 }, { timeMs: 30_000, value: 0.9 }], method: 'manual' };
test('all pacing modes vary lengths, cover the exact duration and reproduce the reviewed grid', () => {
  for (const pacing of ['calm', 'normal', 'dynamic', 'mixed'] as const) {
    const snapshot = { ...emptyTimeline(), production: { purpose: 'promo' as const, brief: 'Promo', sourceAssetIds: [randomUUID()], pacing, targetDurationMs: 60_000 } };
    const slots = makeMontageSlots(snapshot, music);
    assert.equal(slots.reduce((sum, slot) => sum + slot.durationMs, 0), 60_000);
    assert.ok(new Set(slots.map((slot) => slot.durationMs)).size >= 3, pacing);
    assert.ok(slots.every((slot, index) => index === 0 ? slot.startMs === 0 : slot.startMs === slots[index - 1].startMs + slots[index - 1].durationMs));
    assert.deepEqual(slots, makeMontageSlots(snapshot, music));
  }
});
test('longer meaningful actions can cover adjacent cells but cannot cross locks, repeat or leave holes', () => {
  const slots = [0, 1, 2, 3].map((index) => ({ id: `s${index}`, startMs: index * 1000, durationMs: 1000, energy: 0.5, role: 'build' as const }));
  const selection = (slotId: string, throughSlotId?: string) => ({ slotId, throughSlotId, sourceId: 'source', sourceInMs: 0, reason: 'Непрерывное действие' });
  const layout = selectionLayout(slots, { selections: [selection('s0', 's2'), selection('s3')] });
  assert.equal(layout.get('s0')?.durationMs, 3000); assert.equal(layout.size, 2);
  assert.throws(() => selectionLayout(slots, { selections: [selection('s0', 's3')] }));
  assert.throws(() => selectionLayout(slots, { selections: [selection('s0', 's2'), selection('s2', 's3')] }));
  assert.throws(() => selectionLayout(slots, { selections: [selection('s0')] }));
  assert.throws(() => selectionLayout(slots.map((slot) => slot.id === 's1' ? { ...slot, lockedClipId: randomUUID() } : slot), { selections: [selection('s0', 's2'), selection('s3')] }));
});
test('BPM correction reuses energy without downloading media or calling a model; planning cannot change BPM', async () => {
  const snapshot = { ...emptyTimeline(), production: { purpose: 'promo' as const, brief: 'Promo', sourceAssetIds: [randomUUID()], pacing: 'normal' as const, targetDurationMs: 60_000 } };
  const request = { action: 'rhythm' as const, expectedRevision: 2, idempotencyKey: 'adjust', musicAssetId: music.assetId, musicSourceInMs: 0, bpm: 100, beatOffsetMs: 100 };
  const grid = await prepareMontageRhythm({ version: 1, name: 'Promo', userId: 'u', workspaceId: randomUUID(), timelineId: randomUUID(), revision: 2, snapshot, checksums: {}, music, request }, async () => { throw new Error('Must not download again'); }, AbortSignal.timeout(1000));
  assert.equal(grid.music.bpm, 100); assert.deepEqual(grid.music.energy, music.energy); assert.equal(grid.music.beatsMs[0], 100); assert.equal(music.bpm, 120);
  assert.equal(montageJobRequestSchema.safeParse({ action: 'plan', expectedRevision: 2, idempotencyKey: 'x', model: 'google/gemini-3.1-flash-lite', gridJobId: randomUUID(), bpm: 100 }).success, false);
  assert.equal(montageJobRequestSchema.safeParse({ action: 'plan', expectedRevision: 2, idempotencyKey: 'x', model: 'google/gemini-3.1-flash-lite', analysisJobId: randomUUID() }).success, false);
});
