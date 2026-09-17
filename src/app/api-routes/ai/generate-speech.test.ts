import assert from 'node:assert/strict';
import test from 'node:test';
import { createGenerateSpeechPost } from './generate-speech-handler';

const workspaceId = '01900000-0000-7000-8000-000000000001';
const documentId = '01900000-0000-7000-8000-000000000002';
type Dependencies = NonNullable<Parameters<typeof createGenerateSpeechPost>[0]>;
const submission = { job: { id: 'job', workspaceId, documentId, operation: 'generate_speech_long', status: 'queued' as const,
  provider: 'openrouter', modelId: 'model', attemptCount: 0, maxAttempts: 3, finalAssetId: null, leaseExpiresAt: null,
  retryAvailableAt: null, error: null, usage: { complete: false, inputTokens: null, outputTokens: null, totalTokens: null,
    providerCostUsd: null, internalCreditsCharged: null, internalCreditsBalanceAfter: null }, createdAt: '', updatedAt: '', startedAt: null, finishedAt: null },
  asset: null, progress: { totalParts: 3, completedParts: 0, phase: 'queued' }, statusUrl: '/api/generation-jobs/job' };
function fixture() {
  const events: string[] = [];
  const dependencies: Dependencies = {
    userId: async () => { events.push('session'); return 'author'; },
    authorizeProvider: async (userId, workspace) => { assert.equal(userId, 'author'); assert.equal(workspace, workspaceId); events.push('authorize'); },
    submit: async (input) => { assert.equal(input.userId, 'author'); assert.equal(input.idempotencyKey, 'one-request'); events.push('submit'); return submission; },
    execute: async () => { events.push('short-execution'); return { job: { id: 'short' }, result: { audioBody: new Uint8Array([1, 2]), contentType: 'audio/wav', generationId: 'provider' } }; },
    toErrorResponse: (error) => Response.json({ error: 'Access denied.' }, { status: Number((error as { status: number }).status) || 500 }),
  };
  return { dependencies, events };
}
function request(extra: Record<string, unknown> = {}) {
  return new Request('http://local/api/ai/generate-speech', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, documentId, idempotencyKey: 'one-request', inputText: 'A complete sentence. '.repeat(300), ...extra }) });
}

test('long Voice authenticates and authorizes before queueing; HTTP only returns durable job metadata', async () => {
  const setup = fixture();
  const response = await createGenerateSpeechPost(setup.dependencies)(request());
  assert.equal(response.status, 202); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(setup.events, ['session', 'authorize', 'submit']);
  assert.deepEqual(await response.json(), submission);
});

test('unauthenticated and cross-workspace speech never enqueue or dispatch', async () => {
  for (const kind of ['session', 'workspace']) {
    const setup = fixture();
    if (kind === 'session') setup.dependencies.userId = async () => { throw Object.assign(new Error('Session required.'), { status: 401 }); };
    else setup.dependencies.authorizeProvider = async () => { throw Object.assign(new Error('Workspace denied.'), { status: 403 }); };
    const response = await createGenerateSpeechPost(setup.dependencies)(request());
    assert.equal(response.status, kind === 'session' ? 401 : 403);
    assert.ok(!setup.events.includes('submit') && !setup.events.includes('short-execution'));
  }
});

test('oversized text/body or missing durable scope is rejected before paid work', async () => {
  const setup = fixture(); const post = createGenerateSpeechPost(setup.dependencies);
  for (const changes of [{ inputText: 'x'.repeat(30_001) }, { inputText: 'x'.repeat(300_000) }, { documentId: undefined }, { idempotencyKey: undefined }]) {
    assert.equal((await post(request(changes))).status, 400);
  }
  assert.equal(setup.events.length, 0);
  assert.equal((await post(new Request('http://local/api/ai/generate-speech', { method: 'POST', body: JSON.stringify({ inputText: 'cross-origin form' }) }))).status, 415);
});

test('short Voice preserves the binary response and existing execution authorization wrapper', async () => {
  const setup = fixture();
  const response = await createGenerateSpeechPost(setup.dependencies)(request({ inputText: 'A short sentence.' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.equal(response.headers.get('x-generation-job-id'), 'short');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
  assert.deepEqual(setup.events, ['short-execution']);
});

test('a retryable worker failure is still accepted/in progress, not a terminal duplicate-generation invitation', async () => {
  const setup = fixture();
  setup.dependencies.submit = async () => ({ ...submission, job: { ...submission.job, status: 'failed',
    error: { code: 'storage_unavailable', message: 'Saved audio will be retried.', retryable: true } } });
  assert.equal((await createGenerateSpeechPost(setup.dependencies)(request())).status, 202);
});
