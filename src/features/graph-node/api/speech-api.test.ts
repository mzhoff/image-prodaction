import assert from 'node:assert/strict';
import test from 'node:test';
import { isSpeechJobTerminal, requestCancelSpeechJob, requestSpeech, requestSpeechJob } from './speech-api.ts';

const scope = { workspaceId: 'workspace', documentId: 'document' };
const payload = { inputText: 'Test voice.', language: 'en' as const, model: 'test', voice: 'Kore', responseFormat: 'mp3' as const };
const asset = { id: 'audio-result', originalName: 'voice.mp3', contentType: 'audio/mpeg', createdAt: '2026-09-06T00:00:00Z', byteSize: 1024,
  audio: { container: 'mp3', codec: 'mp3', contentType: 'audio/mpeg', durationSeconds: 1, sampleRateHz: 24000, channels: 1 } };

test('short speech keeps binary response, explicit scope and the original idempotency key', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options: RequestInit) => {
    assert.equal(url, '/api/ai/generate-speech');
    assert.equal(options.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(options.body)), { ...payload, ...scope, idempotencyKey: 'stable-key' });
    return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/mpeg', 'x-generation-id': 'provider-id' } });
  });
  const result = await requestSpeech(payload, { scope, idempotencyKey: 'stable-key' });
  assert.ok('blob' in result); assert.equal(result.blob.size, 2); assert.equal(result.generationId, 'provider-id');
});

test('long speech submits once, polls a stable job and receives the existing server asset without another upload', async (t) => {
  const requests: string[] = []; const jobs: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    requests.push(String(url));
    return requests.length === 1 ? Response.json({ job: { id: 'job', status: 'queued' }, progress: { completedParts: 0, totalParts: 3, phase: 'queued' } }, { status: 202 })
      : Response.json({ job: { id: 'job', status: 'succeeded' }, asset });
  });
  const result = await requestSpeech(payload, { scope, idempotencyKey: 'stable-key', onJobAccepted: (id) => jobs.push(id) });
  assert.ok('asset' in result); assert.equal(result.asset.id, asset.id);
  assert.deepEqual(requests, ['/api/ai/generate-speech', '/api/generation-jobs/job']);
  assert.deepEqual(jobs, ['job', 'job']);
});

test('retryable failed jobs stay attached; permanent failure never re-submits paid work', async (t) => {
  let permanent = false;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ job: { id: 'job', status: 'failed', error: { retryable: !permanent, message: 'Review the request' } } }));
  assert.equal(await isSpeechJobTerminal('job'), false);
  permanent = true;
  assert.equal(await isSpeechJobTerminal('job'), true);
  await assert.rejects(requestSpeechJob('job', { scope, idempotencyKey: 'stable' }), /Review the request/u);
});

test('closing the browser poll does not request server cancellation; explicit cancellation uses the real POST route', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options: RequestInit) => {
    calls++; assert.equal(url, '/api/generation-jobs/job/cancel'); assert.equal(options.method, 'POST');
    return Response.json({ job: { id: 'job', status: 'canceled' } });
  });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestSpeechJob('job', { scope, idempotencyKey: 'stable', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0); await requestCancelSpeechJob('job'); assert.equal(calls, 1);
});
