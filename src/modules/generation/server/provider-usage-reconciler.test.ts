import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeProviderAdapter } from '@/modules/provider-connections';
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
