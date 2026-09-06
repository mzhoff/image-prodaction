import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpeechProviderCall, speechOptionsSchema } from './speech-provider-call';
import { EMPTY_PROVIDER_USAGE, type ProviderAdapter } from '../contracts/provider-contracts';
import { ProviderAdapterError } from '../core/provider-errors';

const adapter = { getOperationStatus: async () => ({ usage: EMPTY_PROVIDER_USAGE }) } as unknown as ProviderAdapter;
test('speech wraps PCM into a WAV and round-trips the durable checkpoint', async () => {
  const call = createSpeechProviderCall(speechOptionsSchema.parse({ inputText: 'Проверка озвучки',
    model: 'google/gemini-3.1-flash-tts-preview', responseFormat: 'pcm' }), new AbortController().signal,
  async () => new Response(new Uint8Array([0, 0, 1, 0]), { headers: { 'content-type': 'audio/pcm;rate=24000', 'x-generation-id': 'generation-1' } }));
  const result = await call.invoke({ apiKey: 'test', adapter });
  assert.equal(result.providerOperationId, 'generation-1');
  assert.equal(result.result.contentType, 'audio/wav');
  assert.equal(Buffer.from(result.result.audioBody).toString('ascii', 0, 4), 'RIFF');
  assert.deepEqual(call.checkpoint.deserialize(call.checkpoint.serialize(result.result)), result.result);
});
test('oversized speech retains known paid operation id for reconciliation without retry', async () => {
  const call = createSpeechProviderCall(speechOptionsSchema.parse({ inputText: 'Проверка озвучки' }), new AbortController().signal,
    async () => new Response('x', { headers: { 'content-length': String(30 * 1024 * 1024), 'x-generation-id': 'paid-operation' } }));
  await assert.rejects(call.invoke({ apiKey: 'test', adapter }), (error) => {
    assert.ok(error instanceof ProviderAdapterError);
    assert.equal(error.descriptor.providerOperationId, 'paid-operation');
    assert.equal(error.descriptor.classification, 'ambiguous');
    return true;
  });
});
test('speech validates text limits before any paid dispatch', () => {
  assert.equal(speechOptionsSchema.safeParse({ inputText: 'a'.repeat(5001) }).success, false);
  assert.equal(speechOptionsSchema.safeParse({ inputText: ' ' }).success, false);
});
