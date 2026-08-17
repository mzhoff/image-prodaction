import assert from 'node:assert/strict';
import test from 'node:test';
import type { AttachmentObjectStorage } from '@prodactionpro/chat-application';
import type { ManagedAttachment } from '@prodactionpro/chat-domain';
import { InlineReadAttachmentObjectStorage } from './inline-read-attachment-storage.ts';

test('creates a data URL from a private stored image', async () => {
  const delegate = createStorage({
    body: new Uint8Array([0, 1, 2, 3]),
    contentLength: 4,
    contentType: 'image/webp',
  });
  const storage = new InlineReadAttachmentObjectStorage(delegate, 1024);

  const target = await storage.createReadTarget(createAttachment());

  assert.equal(target.url, 'data:image/webp;base64,AAECAw==');
});

test('reads streaming image bodies and enforces the inline byte limit', async () => {
  const delegate = createStorage({
    body: (async function* () {
      yield new Uint8Array([0, 1]);
      yield new Uint8Array([2, 3]);
    })(),
    contentType: 'image/webp',
  });
  const storage = new InlineReadAttachmentObjectStorage(delegate, 3);

  await assert.rejects(
    storage.createReadTarget(createAttachment({ declaredSizeBytes: 3, sizeBytes: 3 })),
    /exceeds the inline delivery limit/,
  );
});

function createStorage(
  object: Awaited<ReturnType<AttachmentObjectStorage['getObject']>>,
): AttachmentObjectStorage {
  return {
    createReadTarget: async () => ({ url: 'http://private-storage.local/image.webp' }),
    createUploadTarget: async () => ({
      storageRef: 'private/image.webp',
      upload: { headers: {}, method: 'PUT', url: 'http://private-storage.local/upload' },
    }),
    deleteObject: async () => undefined,
    getObject: async () => object,
  };
}

function createAttachment(overrides: Partial<ManagedAttachment> = {}): ManagedAttachment {
  return {
    createdAt: '2026-08-13T00:00:00.000Z',
    declaredMimeType: 'image/webp',
    declaredSizeBytes: 4,
    id: 'attachment-1',
    kind: 'image',
    mimeType: 'image/webp',
    name: 'reference.webp',
    productId: 'image-production',
    sizeBytes: 4,
    status: 'ready',
    storageRef: 'private/image.webp',
    updatedAt: '2026-08-13T00:00:00.000Z',
    userId: 'user-1',
    ...overrides,
  };
}
