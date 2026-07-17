import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import {
  normalizeOpenRouterUsage,
  resolveTransientGenerationReplay,
} from './transient-generation-ledger';

test('normalizes complete provider usage for the generation ledger', () => {
  assert.deepEqual(normalizeOpenRouterUsage({
    prompt_tokens: 12,
    completion_tokens: 34,
    total_tokens: 46,
    cost: 0.01234,
  }), {
    inputTokens: 12,
    outputTokens: 34,
    totalTokens: 46,
    providerCostUsd: '0.01234',
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  });
});

test('keeps incomplete or invalid provider usage nullable instead of losing a paid result', () => {
  assert.deepEqual(normalizeOpenRouterUsage({
    prompt_tokens: -1,
    completion_tokens: 8,
    cost: Number.NaN,
  }), {
    inputTokens: null,
    outputTokens: 8,
    totalTokens: null,
    providerCostUsd: null,
    internalCreditsCharged: null,
    internalCreditsBalanceAfter: null,
  });
});

test('a completed transient request is not billed again when the same idempotency key is replayed', async () => {
  const response = await resolveTransientGenerationReplay(createJob({
    status: 'succeeded',
    idempotentReplay: true,
  }));
  assert.ok(response);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'transient_generation_already_completed',
      details: { jobId: '01900000-0000-7000-8000-000000000010' },
      message: 'This generation completed, but its transient result is no longer replayable. Run it again as a new request.',
    },
  });
});

function createJob(patch: Partial<GenerationJobDto> = {}): GenerationJobDto {
  return {
    attemptCount: 1,
    createdAt: '2026-07-17T10:00:00.000Z',
    documentId: '01900000-0000-7000-8000-000000000002',
    error: null,
    finalAssetId: null,
    finishedAt: '2026-07-17T10:00:02.000Z',
    id: '01900000-0000-7000-8000-000000000010',
    idempotencyKey: 'edit-node-1',
    idempotentReplay: false,
    leaseExpiresAt: null,
    maxAttempts: 3,
    metadata: null,
    modelId: 'google/gemini-image',
    operation: 'edit_image',
    provider: 'openrouter',
    startedAt: '2026-07-17T10:00:01.000Z',
    status: 'succeeded',
    updatedAt: '2026-07-17T10:00:02.000Z',
    usage: {
      complete: true,
      inputTokens: '10',
      internalCreditsBalanceAfter: null,
      internalCreditsCharged: null,
      outputTokens: '5',
      providerCostUsd: '0.01',
      totalTokens: '15',
    },
    workspaceId: '01900000-0000-7000-8000-000000000001',
    ...patch,
  };
}
