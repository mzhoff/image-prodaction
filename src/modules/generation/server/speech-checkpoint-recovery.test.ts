import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSpeech, type SpeechChunkExecutor } from './speech-generation';
import { executeShortOpenRouterCallCore, type ShortAiExecutionDependencies } from './short-ai-execution-core';
import { EMPTY_PROVIDER_USAGE } from '@/modules/provider-connections/contracts/provider-contracts';
import { longSpeechOptionsSchema } from '@/modules/provider-connections/server/speech-provider-call';
import type { assembleSpeechParts } from '@/shared/media/speech-assembly';

function fixture() {
  const jobs = new Map<string, { id: string; status: string; resultObjectKey?: string }>();
  const checkpoints = new Map<string, unknown>();
  let paid = 0;
  let uncertainIndex: number | null = null;
  const dependencies: ShortAiExecutionDependencies = {
    adapter: { classifyError: () => ({ classification: 'ambiguous', code: 'timeout', httpStatus: 504,
      message: 'Outcome unknown.', providerOperationId: 'paid-uncertain', retryAfterMs: null }) } as unknown as ShortAiExecutionDependencies['adapter'],
    async createJob(input) {
      const existing = jobs.get(input.idempotencyKey);
      if (existing) return { ...existing, idempotentReplay: true };
      const job = { id: `job-${jobs.size}`, status: 'queued' }; jobs.set(input.idempotencyKey, job);
      return { ...job, idempotentReplay: false };
    },
    userId: async () => 'author', resolveCredential: async () => ({ apiKey: 'test', connection: { id: 'connection' } }),
    startJob: async (id) => { lookup(id).status = 'running'; return { attemptCount: 1 }; },
    markProviderDispatched: async () => undefined, markProviderUsed: async () => undefined, recordUsage: async () => undefined,
    saveResult: async ({ jobId, payload }) => { const key = `${jobId}:result`; checkpoints.set(key, payload); lookup(jobId).resultObjectKey = key; },
    readResult: async (key) => checkpoints.get(key), succeedJob: async ({ jobId }) => { lookup(jobId).status = 'succeeded'; },
    failJob: async ({ jobId }) => { lookup(jobId).status = 'failed'; },
  };
  function lookup(id: string) { return [...jobs.values()].find((job) => job.id === id)!; }
  const execute: SpeechChunkExecutor = (call) => executeShortOpenRouterCallCore({ ...call, invoke: async () => {
    paid += 1;
    if (Number(call.scope.metadata?.speechChunkIndex) === uncertainIndex) throw new Error('connection lost after dispatch');
    return { providerOperationId: `provider-${paid}`, usage: EMPTY_PROVIDER_USAGE,
      result: { audioBody: new Uint8Array([paid]), contentType: 'audio/wav', generationId: `provider-${paid}` } };
  } }, dependencies);
  const input = { actorUserId: 'author', scope: { workspaceId: 'workspace', idempotencyKey: 'one-request' },
    signal: new AbortController().signal, options: longSpeechOptionsSchema.parse({ inputText: 'A source sentence. '.repeat(600) }) };
  return { input, execute, jobs, checkpoints, paid: () => paid, uncertain: (index: number) => { uncertainIndex = index; } };
}
const assemble: typeof assembleSpeechParts = async ({ parts }) => {
  const data: number[] = []; for await (const bytes of parts) data.push(...bytes);
  return { bytes: new Uint8Array(data), audio: { container: 'mp3', codec: 'mp3', contentType: 'audio/mpeg', durationSeconds: 1, sampleRateHz: 24000, channels: 1 },
    byteSize: data.length, checksumSha256: 'hash', contentType: 'audio/mpeg', extension: 'mp3' };
};

test('real short-call core checkpoints survive orchestration restart without duplicate paid requests', async () => {
  const setup = fixture();
  await assert.rejects(generateSpeech(setup.input, { execute: setup.execute, assemble: async (parts) => { await assemble(parts); throw new Error('disk failure'); } }), /disk failure/);
  const paid = setup.paid();
  assert.ok(paid > 1); assert.equal(setup.checkpoints.size, paid);
  for (const value of setup.checkpoints.values()) assert.ok(typeof (value as { audioBase64: string }).audioBase64 === 'string');
  const result = await generateSpeech(setup.input, { execute: setup.execute, assemble });
  assert.equal(setup.paid(), paid); assert.equal(result.chunkCount, paid);
});

test('a dispatched part with no checkpoint stays blocked on replay; later parts never dispatch', async () => {
  const setup = fixture(); setup.uncertain(1);
  await assert.rejects(generateSpeech(setup.input, { execute: setup.execute, assemble }), /Outcome unknown/);
  assert.equal(setup.paid(), 2); assert.equal(setup.checkpoints.size, 1);
  await assert.rejects(generateSpeech(setup.input, { execute: setup.execute, assemble }), /already been accepted/);
  assert.equal(setup.paid(), 2);
});
