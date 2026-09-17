import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeProviderAdapter } from '@/modules/provider-connections';
import type { VideoProviderAdapter } from '@/modules/provider-connections/contracts/video-provider';
import {
  reconcileOpenRouterUsageBatch,
  type ProviderUsageReconcilerDependencies,
} from './provider-usage-reconciler';

test('reconciler persists complete provider usage for every eligible job', async () => {
  const adapter = createFakeProviderAdapter({
    acceptedCredential: 'workspace-secret',
    usage: {
      complete: true,
      inputTokens: 12,
      outputTokens: 8,
      providerCostUsd: '0.0042',
      totalTokens: 20,
    },
  });
  const providerResult = await adapter.execute({
    expectedOutputModalities: ['text'],
    messages: [{ role: 'user', parts: [{ modality: 'text', text: 'test' }] }],
    modelId: 'fake/text-model',
    operation: 'generate_text',
  }, {
    credential: 'workspace-secret',
  });
  const reconciled: Array<{ id: string; totalTokens: number | null }> = [];

  const result = await reconcileOpenRouterUsageBatch(25, {
    adapter,
    async loadCandidates() {
      return [{
        attemptCount: 1,
        id: 'job-1',
        providerDispatchedAttempt: 1,
        providerOperationId: providerResult.providerOperationId!,
        workspaceId: 'workspace-1',
      }];
    },
    async reconcileCandidate(candidate, usage) {
      reconciled.push({ id: candidate.id, totalTokens: usage.totalTokens });
    },
    async resolveCredential() {
      return 'workspace-secret';
    },
  });

  assert.deepEqual(result, {
    scanned: 1,
    reconciled: 1,
    pending: 0,
    failed: 0,
  });
  assert.deepEqual(reconciled, [{ id: 'job-1', totalTokens: 20 }]);
});

test('reconciler leaves incomplete usage pending and isolates candidate failures', async () => {
  const adapter = createFakeProviderAdapter({ acceptedCredential: 'workspace-secret' });
  const dependencies: ProviderUsageReconcilerDependencies = {
    adapter,
    async loadCandidates() {
      return [{
        attemptCount: 1,
        id: 'job-pending',
        providerDispatchedAttempt: 1,
        providerOperationId: 'unknown-operation',
        workspaceId: 'workspace-pending',
      }, {
        attemptCount: 1,
        id: 'job-failed',
        providerDispatchedAttempt: 1,
        providerOperationId: 'another-operation',
        workspaceId: 'workspace-failed',
      }];
    },
    async reconcileCandidate() {
      assert.fail('Incomplete or failed candidates must not be reconciled.');
    },
    async resolveCredential(workspaceId) {
      if (workspaceId === 'workspace-failed') {
        throw new Error('credential temporarily unavailable');
      }
      return 'workspace-secret';
    },
  };

  const result = await reconcileOpenRouterUsageBatch(25, dependencies);

  assert.deepEqual(result, {
    scanned: 2,
    reconciled: 0,
    pending: 1,
    failed: 1,
  });
});

test('late price is reconciled even when all token counts were already complete', async () => {
  const adapter = createFakeProviderAdapter();
  adapter.getOperationStatus = async (providerOperationId) => ({
    state: 'succeeded', error: null, modelId: 'fake/text-model', providerOperationId,
    usage: { complete: true, inputTokens: 12, outputTokens: 8, totalTokens: 20,
      providerCostUsd: '0.003', cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null },
  });
  let writes = 0;
  const result = await reconcileOpenRouterUsageBatch(1, {
    adapter, resolveCredential: async () => 'test-only',
    loadCandidates: async () => [{
      id: 'job-1', attemptCount: 2, providerDispatchedAttempt: 2,
      providerOperationId: 'op-2', workspaceId: 'workspace-1', usageRevision: 0,
      inputTokens: '12', outputTokens: '8', totalTokens: '20', providerCostUsd: null,
    }],
    reconcileCandidate: async (_candidate, usage) => { writes += 1; assert.equal(usage.providerCostUsd, '0.003'); },
  });
  assert.equal(result.reconciled, 1);
  assert.equal(writes, 1);
});

test('unchanged token-only response does not append endless reconciliation revisions', async () => {
  const adapter = createFakeProviderAdapter();
  adapter.getOperationStatus = async (providerOperationId) => ({
    state: 'succeeded', error: null, modelId: 'fake/text-model', providerOperationId,
    usage: { complete: true, inputTokens: 12, outputTokens: 8, totalTokens: 20,
      providerCostUsd: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null },
  });
  const result = await reconcileOpenRouterUsageBatch(1, {
    adapter, resolveCredential: async () => 'test-only',
    loadCandidates: async () => [{
      id: 'job-1', attemptCount: 1, providerDispatchedAttempt: 1,
      providerOperationId: 'op-1', workspaceId: 'workspace-1', usageRevision: 0,
      inputTokens: '12', outputTokens: '8', totalTokens: '20', providerCostUsd: null,
    }],
    reconcileCandidate: async () => { assert.fail('No newly known data.'); },
  });
  assert.equal(result.pending, 1);
  assert.equal(result.reconciled, 0);
});

test('video reconciliation polls the durable video ID, not the chat generation ID, without dispatching again', async () => {
  const adapter = createFakeProviderAdapter();
  adapter.getOperationStatus = async () => { assert.fail('Video has its own status API.'); };
  const usage = { complete: true, providerCostUsd: '0.42', inputTokens: null, outputTokens: null,
    totalTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null };
  const videoAdapter: VideoProviderAdapter = {
    submit: async () => { assert.fail('Reconciliation never generates video.'); },
    download: async () => { assert.fail('Reconciliation never downloads media.'); },
    poll: async (id, context) => {
      assert.equal(id, 'video-accepted-id'); assert.equal(context.credential, 'workspace-secret');
      return { operationId: id, generationId: 'gen-accounting-id', status: 'completed', usage };
    },
  };
  const writes: string[] = [];
  const result = await reconcileOpenRouterUsageBatch(1, { adapter, videoAdapter,
    resolveCredential: async () => 'workspace-secret',
    loadCandidates: async () => [{ id: 'canceled-video-job', operation: 'generate_video', attemptCount: 2,
      providerDispatchedAttempt: 1, providerOperationId: 'gen-accounting-id', videoOperationId: 'video-accepted-id',
      workspaceId: 'workspace-1', providerCostUsd: null }],
    reconcileCandidate: async (candidate, actual) => {
      assert.equal(candidate.providerDispatchedAttempt, 1); assert.equal(actual.providerCostUsd, '0.42'); writes.push(candidate.id);
    },
  });
  assert.deepEqual(result, { scanned: 1, reconciled: 1, pending: 0, failed: 0 });
  assert.deepEqual(writes, ['canceled-video-job']);
});
