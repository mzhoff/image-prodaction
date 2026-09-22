import { makeMontageSlots } from '@/modules/story-projects/core/montage-plan';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';
import { emptyTimeline } from '@/modules/story-projects/contracts/story-timeline';
import type { MontagePayload } from './montage-contracts';
import { planMontage } from './montage-planning';

const videoId = randomUUID(), audioId = randomUUID();
const payload: MontagePayload = { version: 1, userId: 'author', workspaceId: randomUUID(), timelineId: randomUUID(), name: 'Promo', revision: 0,
  snapshot: { ...emptyTimeline(), production: { purpose: 'promo', brief: 'Show a rising wave', pacing: 'dynamic', targetDurationMs: 5000, sourceAssetIds: [videoId] } },
  request: { action: 'plan', model: DEFAULT_TIMELINE_MODEL, idempotencyKey: 'request', expectedRevision: 0, gridJobId: randomUUID() },
  checksums: { [videoId]: 'a'.repeat(64), [audioId]: 'b'.repeat(64) }, analysis: {
    version: 1, complete: true, completedAssetIds: [videoId],
    sources: [{ id: 'source', assetId: videoId, checksum: 'a'.repeat(64), startMs: 0, endMs: 10000, description: 'A wave grows' }],
    music: { version: 1, assetId: audioId, checksum: 'b'.repeat(64), durationMs: 5000, sourceInMs: 0, confidence: 1, bpm: 120,
      beatsMs: Array.from({ length: 10 }, (_, i) => i * 500), energy: [{ timeMs: 0, value: 0.1 }, { timeMs: 3500, value: 1 }], method: 'manual' },
  } };
payload.slots = makeMontageSlots(payload.snapshot, payload.analysis!.music!);
test('LLM planning uses the paid execution boundary and validates JSON against the actual source catalogue', async () => {
  const original = structuredClone(payload), jobId = randomUUID();
  let calls = 0;
  const execute: NonNullable<Parameters<typeof planMontage>[3]> = async (input) => {
    calls++; assert.equal(input.idempotencyKey, `montage-plan:${jobId}`); assert.equal(input.metadata?.timelineId, payload.timelineId);
    const text = input.providerRequest.messages![1].parts[0]; assert.equal(text.modality, 'text');
    if (text.modality !== 'text') throw new Error('Expected prompt');
    const prompt = JSON.parse(text.text) as { slots: { id: string; startMs: number }[]; brief: string };
    assert.equal(prompt.brief, payload.snapshot.production!.brief);
    const selection = { selections: prompt.slots.map((slot) => ({ slotId: slot.id, sourceId: 'source', sourceInMs: slot.startMs, reason: 'Волна растёт' })) };
    const response = { outputs: [{ modality: 'text', text: JSON.stringify(selection) }] } as Parameters<typeof input.transform>[0];
    return { result: await input.transform(response) } as Awaited<ReturnType<typeof execute>>;
  };
  const result = await planMontage(payload, jobId, AbortSignal.timeout(5000), execute);
  assert.equal(calls, 1); assert.equal(result.kind, 'proposal'); assert.equal(result.snapshot.clips.reduce((sum, c) => sum + c.durationMs, 0), 5000);
  assert.equal(result.snapshot.audioClips?.[0].assetId, audioId); assert.deepEqual(payload, original);
  const invalid: typeof execute = async (input) => {
    const response = { outputs: [{ modality: 'text', text: '{"selections":[{"slotId":"invented","sourceId":"invented","sourceInMs":0,"reason":"bad"}]}' }] } as Parameters<typeof input.transform>[0];
    return { result: await input.transform(response) } as Awaited<ReturnType<typeof execute>>;
  };
  await assert.rejects(planMontage(payload, jobId, AbortSignal.timeout(5000), invalid), /ячейку/);
});
