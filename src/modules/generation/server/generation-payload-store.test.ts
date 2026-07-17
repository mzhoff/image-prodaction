import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGenerationPayloadStore,
  GenerationPayloadInvalidError,
} from './generation-payload-store';
import type {
  AssetObjectLocation,
  AssetObjectStore,
} from '@/shared/storage/s3-assets';

test('generation payload store writes private scoped JSON and reads it back', async () => {
  const objects = new Map<string, Uint8Array>();
  const store = createGenerationPayloadStore(createFakeStore(objects), 'private-bucket');
  const key = await store.write({
    workspaceId: '01900000-0000-7000-8000-000000000001',
    jobId: '01900000-0000-7000-8000-000000000002',
    kind: 'request',
    payload: { prompt: 'hello' },
  });

  assert.equal(
    key,
    'workspaces/01900000-0000-7000-8000-000000000001/generation-jobs/01900000-0000-7000-8000-000000000002/request.json',
  );
  assert.deepEqual(await store.read(key), { prompt: 'hello' });
  await store.delete(key);
  assert.equal(objects.size, 0);
});

test('generation payload store rejects keys outside the generation prefix', async () => {
  const store = createGenerationPayloadStore(createFakeStore(new Map()), 'private-bucket');
  await assert.rejects(
    store.read('workspaces/other/credentials.json'),
    GenerationPayloadInvalidError,
  );
});

test('generation payload store distinguishes a missing checkpoint from an S3 outage', async () => {
  const store = createGenerationPayloadStore(createFakeStore(new Map()), 'private-bucket');
  const key =
    'workspaces/01900000-0000-7000-8000-000000000001/generation-jobs/01900000-0000-7000-8000-000000000002/result-attempt-1.json';
  assert.equal(await store.readOptional(key), null);

  const unavailable = createFakeStore(new Map());
  unavailable.get = async () => {
    throw Object.assign(new Error('S3 unavailable'), {
      $metadata: { httpStatusCode: 503 },
      name: 'ServiceUnavailable',
    });
  };
  const unavailableStore = createGenerationPayloadStore(unavailable, 'private-bucket');
  await assert.rejects(unavailableStore.readOptional(key), /S3 unavailable/);
});

function createFakeStore(objects: Map<string, Uint8Array>): AssetObjectStore {
  function objectKey(location: AssetObjectLocation) {
    return `${location.bucket}/${location.key}`;
  }

  return {
    async health() {},
    async put(input) {
      objects.set(objectKey(input), input.body);
    },
    async get(location) {
      const body = objects.get(objectKey(location));
      if (!body) throw Object.assign(new Error('not found'), { name: 'NoSuchKey' });
      const copy = Uint8Array.from(body);
      return {
        body: new Blob([copy.buffer]).stream(),
        contentLength: body.byteLength,
        contentType: 'application/json',
      };
    },
    async delete(location) {
      objects.delete(objectKey(location));
    },
  };
}
