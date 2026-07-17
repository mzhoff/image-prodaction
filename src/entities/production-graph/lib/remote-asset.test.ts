import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateAssetScope,
  deleteRemoteAsset,
  getActiveAssetScope,
  getRemoteAssetContentUrl,
  isRemoteImageMimeType,
  loadRemoteAssetBlob,
  mapUploadedImageAsset,
  uploadRemoteImageAsset,
} from './remote-asset.ts';

const scope = {
  documentId: '019b48b0-40e7-7a1b-8000-000000000002',
  workspaceId: '019b48b0-40e7-7a1b-8000-000000000001',
};

test('active scope is copied and only its own cleanup can clear it', () => {
  const firstCleanup = activateAssetScope(scope);
  const secondScope = { ...scope, documentId: '019b48b0-40e7-7a1b-8000-000000000003' };
  const secondCleanup = activateAssetScope(secondScope);

  firstCleanup();
  assert.deepEqual(getActiveAssetScope(), secondScope);
  secondCleanup();
  assert.equal(getActiveAssetScope(), undefined);
});

test('supported web image types use the remote path while SVG stays local-compatible', () => {
  assert.equal(isRemoteImageMimeType('image/png'), true);
  assert.equal(isRemoteImageMimeType('image/jpeg; charset=binary'), true);
  assert.equal(isRemoteImageMimeType('image/webp'), true);
  assert.equal(isRemoteImageMimeType('image/gif'), true);
  assert.equal(isRemoteImageMimeType('image/svg+xml'), false);
  assert.equal(isRemoteImageMimeType('audio/mpeg'), false);
});

test('server DTO maps to a remote graph asset without an IndexedDB key', () => {
  const asset = mapUploadedImageAsset({
    contentType: 'image/png',
    createdAt: '2026-07-16T00:00:00.000Z',
    height: 480,
    id: '019b48b0-40e7-7a1b-8000-000000000010',
    originalName: 'result.png',
    width: 640,
  });

  assert.equal(asset.id, asset.storage.type === 'remote' ? asset.storage.assetId : undefined);
  assert.equal(asset.width, 640);
  assert.deepEqual(asset.storage, { type: 'remote', assetId: asset.id });
});

test('upload sends authenticated multipart scope and returns the server asset id', async () => {
  let capturedForm: FormData | undefined;
  const asset = await uploadRemoteImageAsset(
    new File([new Uint8Array([1, 2, 3])], 'input.png', { type: 'image/png' }),
    scope,
    async (input, init) => {
      assert.equal(input, '/api/assets/images');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'same-origin');
      capturedForm = init?.body as FormData;
      return Response.json({
        asset: {
          contentType: 'image/png',
          createdAt: '2026-07-16T00:00:00.000Z',
          height: 1,
          id: '019b48b0-40e7-7a1b-8000-000000000010',
          originalName: 'input.png',
          width: 1,
        },
      }, { status: 201 });
    },
  );

  assert.equal(capturedForm?.get('documentId'), scope.documentId);
  assert.equal(capturedForm?.get('origin'), 'uploaded');
  assert.equal(capturedForm?.get('workspaceId'), scope.workspaceId);
  assert.equal((capturedForm?.get('file') as File).name, 'input.png');
  assert.equal(asset.id, '019b48b0-40e7-7a1b-8000-000000000010');
});

test('explicit Library save sends the durable saved origin', async () => {
  let capturedForm: FormData | undefined;
  await uploadRemoteImageAsset(
    new File([new Uint8Array([1, 2, 3])], 'technical-result.png', { type: 'image/png' }),
    scope,
    'saved',
    async (_input, init) => {
      capturedForm = init?.body as FormData;
      return Response.json({
        asset: {
          contentType: 'image/png',
          createdAt: '2026-07-16T00:00:00.000Z',
          height: 1,
          id: '019b48b0-40e7-7a1b-8000-000000000011',
          originalName: 'technical-result.png',
          width: 1,
        },
      }, { status: 201 });
    },
  );

  assert.equal(capturedForm?.get('origin'), 'saved');
});

test('content read and delete use private same-origin API routes', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchAsset = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 });
  };
  const assetId = '019b48b0-40e7-7a1b-8000-000000000010';

  const blob = await loadRemoteAssetBlob(assetId, fetchAsset);
  await deleteRemoteAsset(assetId, fetchAsset);

  assert.equal(blob.type, 'image/png');
  assert.equal(calls[0].input, getRemoteAssetContentUrl(assetId));
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.deepEqual(calls[1], {
    input: `/api/assets/${assetId}`,
    init: { method: 'DELETE', credentials: 'same-origin' },
  });
});
