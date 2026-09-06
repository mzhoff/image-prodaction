import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { runtimeV2DefaultScopes, runtimeV2CreateClientSchema } from '../contracts/runtime-v2-contracts';
import { runtimeV2OpenApi } from '../contracts/runtime-v2-openapi';
import { runtimeAudioUploadResponseSchema } from '../contracts/runtime-audio-contracts';
import { requireRuntimeScope } from '../core/runtime-v2-credentials';
import { handleRuntimeV2 } from './runtime-v2-api';
import { runtimeAudioUploadAssetId } from './runtime-audio-upload';
import { isUuidV7 } from '@/shared/lib/id';

test('audio upload scope requires explicit permission, never inferred from existing defaults/read/manage', () => {
  assert.equal(runtimeV2DefaultScopes.some((scope) => String(scope) === 'pipeline.asset.write'), false);
  assert.throws(() => requireRuntimeScope(['pipeline.artifact.read', 'pipeline.grants.manage'], 'pipeline.asset.write'), { code: 'missing_scope' });
  assert.doesNotThrow(() => requireRuntimeScope(['pipeline.asset.write'], 'pipeline.asset.write'));
  const client = runtimeV2CreateClientSchema.parse({ displayName: 'Audio test', sourceApplication: 'audio-test', externalWorkspaceRef: 'workspace', scopes: ['pipeline.asset.write'] });
  assert.deepEqual(client.scopes, ['pipeline.asset.write']);
});
test('runtime audio endpoint authenticates before reading multipart payload', async () => {
  let consumed = false;
  const body = new ReadableStream({ pull() { consumed = true; } });
  const request = new Request('http://local/v2/runtime/assets/audio', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=audio' }, body, duplex: 'half' } as RequestInit);
  const response = await handleRuntimeV2(request, ['assets', 'audio']);
  assert.equal(response.status, 401); assert.equal((await response.json()).error.code, 'invalid_credential');
  // Constructing a ReadableStream may pull once; there must still be no body reader acquired.
  assert.equal(request.bodyUsed, false); void consumed;
});
test('upload retry identity is isolated by service client and stable across credential rotation', () => {
  const first = runtimeAudioUploadAssetId('client-one', 'request-one');
  assert.equal(isUuidV7(first), true);
  assert.equal(runtimeAudioUploadAssetId('client-one', 'request-one'), first);
  assert.notEqual(runtimeAudioUploadAssetId('client-two', 'request-one'), first);
  assert.notEqual(runtimeAudioUploadAssetId('client-one', 'request-two'), first);
});
test('audio upload OpenAPI derives its private artifact result from canonical validator', () => {
  const endpoint = runtimeV2OpenApi().paths['/assets/audio'].post;
  assert.match(endpoint.summary, /pipeline.asset.write/);
  assert.equal(endpoint.requestBody.content['multipart/form-data'].schema.additionalProperties, false);
  assert.deepEqual(endpoint.responses[201]?.content['application/json'].schema, z.toJSONSchema(runtimeAudioUploadResponseSchema));
  const artifact = { kind: 'audio', assetId: '01a06168-51ef-7035-93a0-8d6a2ef41112', mimeType: 'audio/wav', sizeBytes: 1000, checksumSha256: 'a'.repeat(64), durationSeconds: 1 };
  const audio = { container: 'wav', codec: 'pcm_s16le', contentType: 'audio/wav', durationSeconds: 1, sampleRateHz: 16000, channels: 1 };
  assert.equal(runtimeAudioUploadResponseSchema.safeParse({ artifact, audio }).success, true);
  assert.equal(runtimeAudioUploadResponseSchema.safeParse({ artifact: { ...artifact, storageKey: 'secret' }, audio }).success, false);
});
