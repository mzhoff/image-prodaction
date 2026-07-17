import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFakeProviderAdapter,
  ProviderAdapterError,
  ProviderHttpError,
  type ProviderExecuteRequest,
} from '@/modules/provider-connections';
import type { RecordUsageEventInput } from '@/modules/usage';
import {
  executeShortOpenRouterChatCore,
  ShortAiExecutionError,
  type ShortAiExecutionDependencies,
} from './short-ai-execution-core';

const request: ProviderExecuteRequest = {
  expectedOutputModalities: ['text'],
  messages: [{
    parts: [{ modality: 'text', text: 'Test' }],
    role: 'user',
  }],
  modelId: 'fake/text-model',
  operation: 'generate_text',
};

test('short AI execution persists successful provider usage before completing the job', async () => {
  const fixture = createFixture();
  const execution = await executeShortOpenRouterChatCore({
    request: new Request('http://localhost/api/ai/generate-text'),
    scope: {
      idempotencyKey: 'request-1',
      workspaceId: '01910000-0000-7000-8000-000000000001',
    },
    providerRequest: request,
    transform: (result) => result.outputs[0],
  }, fixture.dependencies);

  assert.equal(execution.job.id, 'job-1');
  assert.equal(fixture.calls.created[0]?.idempotencyKey, 'request-1');
  assert.deepEqual(fixture.calls.dispatched, [{
    attemptCount: 1,
    jobId: 'job-1',
  }]);
  assert.equal(fixture.calls.markedConnectionIds[0], 'connection-1');
  assert.deepEqual(fixture.calls.usage[0], {
    attemptCount: 1,
    generationJobId: 'job-1',
    inputTokens: 10,
    outputTokens: 5,
    providerCostUsd: '0.001',
    providerOperationId: 'fake-operation-1',
    succeeded: true,
    totalTokens: 15,
  });
  assert.equal(fixture.calls.succeeded.length, 1);
  assert.equal(fixture.calls.failed.length, 0);
  assert.deepEqual(fixture.calls.savedResults[0]?.payload, resultOutput('text'));
});

test('short AI execution records a failed physical call and closes the durable job', async () => {
  const providerError = new ProviderAdapterError({
    classification: 'retryable',
    code: 'rate_limited',
    httpStatus: 429,
    message: 'Provider rate limit was reached.',
    providerOperationId: null,
    retryAfterMs: 1_000,
  });
  const fixture = createFixture({
    adapter: createFakeProviderAdapter({
      acceptedCredential: 'workspace-key',
      executeError: providerError,
    }),
  });

  await assert.rejects(
    executeShortOpenRouterChatCore({
      request: new Request('http://localhost/api/ai/generate-text'),
      scope: {
        idempotencyKey: 'request-2',
        workspaceId: '01910000-0000-7000-8000-000000000001',
      },
      providerRequest: request,
      transform: (result) => result,
    }, fixture.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof ShortAiExecutionError);
      assert.equal(error.descriptor.code, 'rate_limited');
      return true;
    },
  );

  assert.equal(fixture.calls.usage[0]?.succeeded, false);
  assert.equal(fixture.calls.usage[0]?.errorCode, 'rate_limited');
  assert.equal(fixture.calls.failed[0]?.errorCode, 'rate_limited');
  assert.equal(fixture.calls.succeeded.length, 0);
});

test('short AI execution preserves provider usage returned with an HTTP failure', async () => {
  const fixture = createFixture({
    adapter: createFakeProviderAdapter({
      acceptedCredential: 'workspace-key',
      executeError: new ProviderHttpError({
        providerOperationId: 'accepted-operation-1',
        status: 503,
        usage: {
          cacheReadTokens: null,
          cacheWriteTokens: null,
          complete: true,
          inputTokens: 8,
          outputTokens: 2,
          providerCostUsd: '0.003',
          reasoningTokens: null,
          totalTokens: 10,
        },
      }),
    }),
  });

  await assert.rejects(executeShortOpenRouterChatCore({
    request: new Request('http://localhost/api/ai/generate-text'),
    scope: {
      idempotencyKey: 'request-with-failed-usage',
      workspaceId: '01910000-0000-7000-8000-000000000001',
    },
    providerRequest: request,
    transform: (result) => result,
  }, fixture.dependencies), ShortAiExecutionError);

  assert.deepEqual(fixture.calls.usage[0], {
    attemptCount: 1,
    errorCode: 'upstream_unavailable',
    generationJobId: 'job-1',
    inputTokens: 8,
    outputTokens: 2,
    providerCostUsd: '0.003',
    providerOperationId: 'accepted-operation-1',
    succeeded: false,
    totalTokens: 10,
  });
  assert.equal(fixture.calls.failed[0]?.usage?.providerCostUsd, '0.003');
});

test('application parsing failure keeps provider usage successful but fails the product job', async () => {
  const fixture = createFixture();

  await assert.rejects(
    executeShortOpenRouterChatCore({
      request: new Request('http://localhost/api/ai/generate-text'),
      scope: {
        idempotencyKey: 'request-3',
        workspaceId: '01910000-0000-7000-8000-000000000001',
      },
      providerRequest: request,
      transform: () => {
        throw new Error('Do not expose this parser detail.');
      },
    }, fixture.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof ShortAiExecutionError);
      assert.equal(error.descriptor.code, 'invalid_response');
      assert.doesNotMatch(error.message, /parser detail/i);
      return true;
    },
  );

  assert.equal(fixture.calls.usage[0]?.succeeded, true);
  assert.equal(fixture.calls.failed[0]?.errorCode, 'invalid_response');
  assert.equal(fixture.calls.failed[0]?.usage?.totalTokens, 15);
});

test('short AI idempotent replay restores the saved paid result without resolving a credential', async () => {
  const fixture = createFixture({
    idempotentReplay: true,
    replayResult: { text: 'already paid' },
  });
  const execution = await executeShortOpenRouterChatCore({
    request: new Request('http://localhost/api/ai/generate-text'),
    scope: {
      idempotencyKey: 'request-replay',
      workspaceId: '01910000-0000-7000-8000-000000000001',
    },
    providerRequest: request,
    transform: (result) => result,
  }, fixture.dependencies);

  assert.deepEqual(execution.result, { text: 'already paid' });
  assert.equal(fixture.calls.resolvedCredentials, 0);
  assert.equal(fixture.calls.succeeded.length, 0);
});

function createFixture(input: {
  adapter?: ShortAiExecutionDependencies['adapter'];
  idempotentReplay?: boolean;
  replayResult?: unknown;
} = {}) {
  const savedResults = new Map<string, unknown>();
  if (input.replayResult !== undefined) savedResults.set('saved-result.json', input.replayResult);
  const calls = {
    created: [] as Parameters<ShortAiExecutionDependencies['createJob']>[0][],
    dispatched: [] as Parameters<ShortAiExecutionDependencies['markProviderDispatched']>[0][],
    failed: [] as Parameters<ShortAiExecutionDependencies['failJob']>[0][],
    markedConnectionIds: [] as string[],
    resolvedCredentials: 0,
    savedResults: [] as Parameters<ShortAiExecutionDependencies['saveResult']>[0][],
    succeeded: [] as Parameters<ShortAiExecutionDependencies['succeedJob']>[0][],
    usage: [] as RecordUsageEventInput[],
  };
  const dependencies: ShortAiExecutionDependencies = {
    adapter: input.adapter ?? createFakeProviderAdapter({
      acceptedCredential: 'workspace-key',
    }),
    createJob: async (job) => {
      calls.created.push(job);
      return {
        id: 'job-1',
        idempotentReplay: input.idempotentReplay ?? false,
        resultObjectKey: input.idempotentReplay ? 'saved-result.json' : null,
        status: input.idempotentReplay ? 'succeeded' : 'queued',
      };
    },
    failJob: async (job) => {
      calls.failed.push(job);
    },
    markProviderDispatched: async (dispatch) => {
      calls.dispatched.push(dispatch);
    },
    markProviderUsed: async (connectionId) => {
      calls.markedConnectionIds.push(connectionId);
    },
    readResult: async (resultObjectKey) => savedResults.get(resultObjectKey),
    recordUsage: async (usage) => {
      calls.usage.push(usage);
    },
    resolveCredential: async () => ({
      ...(calls.resolvedCredentials += 1, {
        apiKey: 'workspace-key',
        connection: { id: 'connection-1' },
      }),
    }),
    saveResult: async (result) => {
      calls.savedResults.push(result);
      savedResults.set('saved-result.json', result.payload);
    },
    startJob: async () => ({ attemptCount: 1 }),
    succeedJob: async (job) => {
      calls.succeeded.push(job);
    },
    userId: async () => 'user-1',
  };
  return { calls, dependencies };
}

function resultOutput(modality: 'text') {
  return {
    modality,
    text: 'Fake provider response.',
  };
}
