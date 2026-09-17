import assert from 'node:assert/strict';
import test from 'node:test';
import { isUuid, isUuidV7 } from '@/shared/lib/id';
import { createDocumentActivityId, insertDocumentActivityOnce, type DocumentActivityIdentity } from './document-activity-identity';

const input: DocumentActivityIdentity = {
  productId: 'image-production', workspaceId: '019f6dff-f0d3-7b5d-8a2b-772de4dcab29', userId: 'user',
  documentId: '01a07cd4-d8f3-749a-91ff-16ba7af2cdc6', nodeId: 'node-video', kind: 'video-generated',
  assetId: '01a09668-733d-7ec6-8b1d-c4aa8b8b7268',
};

test('completion identity survives retries and UUID casing while remaining scoped to actor/document/node/asset', () => {
  const id = createDocumentActivityId(input);
  assert.ok(isUuid(id));
  assert.equal(id[14], '8');
  assert.equal(createDocumentActivityId({ ...input }), id);
  assert.equal(createDocumentActivityId({ ...input, workspaceId: input.workspaceId.toUpperCase(),
    documentId: input.documentId.toUpperCase(), assetId: input.assetId!.toUpperCase() }), id);
  const changes: Partial<DocumentActivityIdentity>[] = [
    { productId: 'other-product' }, { userId: 'another-user' }, { workspaceId: 'another-workspace' },
    { documentId: 'another-document' }, { nodeId: 'another-node' }, { kind: 'image-generated' },
    { assetId: '01a09668-733d-7ec6-8b1d-c4aa8b8b7269' },
  ];
  assert.equal(new Set([id, ...changes.map((change) => createDocumentActivityId({ ...input, ...change }))]).size, changes.length + 1);
});

test('legacy clients without an asset keep independent UUIDv7 events', () => {
  const first = createDocumentActivityId({ ...input, assetId: undefined });
  const second = createDocumentActivityId({ ...input, assetId: undefined });
  assert.ok(isUuidV7(first));
  assert.ok(isUuidV7(second));
  assert.notEqual(first, second);
});

test('concurrent completion watchers and retries return the first immutable event and timestamp', async () => {
  type Row = { id: string; createdAt: string; model: string };
  const rows = new Map<string, Row>();
  let inserts = 0;
  const record = (createdAt: string, model: string) => {
    const id = createDocumentActivityId(input);
    return insertDocumentActivityOnce({
      // Mirrors INSERT ON CONFLICT DO NOTHING RETURNING; uniqueness is atomic.
      insertIfAbsent: async () => {
        if (rows.has(id)) return undefined;
        const row = { id, createdAt, model };
        rows.set(id, row);
        inserts++;
        await Promise.resolve();
        return row;
      },
      findExisting: async () => rows.get(id),
    });
  };
  const results = await Promise.all([
    record('2026-09-12T16:17:03.537Z', 'original-model'),
    record('2026-09-12T16:17:04.887Z', 'repeated-model'),
  ]);
  results.push(await record('2026-09-12T17:00:00.000Z', 'retry-model'));
  assert.equal(rows.size, 1);
  assert.equal(inserts, 1);
  for (const result of results) {
    assert.equal(result.createdAt, '2026-09-12T16:17:03.537Z');
    assert.equal(result.model, 'original-model');
    assert.strictEqual(result, results[0]);
  }
});

test('database failure or an inaccessible conflict never fabricates a completion', async () => {
  await assert.rejects(insertDocumentActivityOnce({
    insertIfAbsent: async () => { throw new Error('database unavailable'); },
    findExisting: async () => { assert.fail('must not hide database errors'); },
  }), /database unavailable/);
  await assert.rejects(insertDocumentActivityOnce({
    insertIfAbsent: async () => undefined, findExisting: async () => undefined,
  }), /could not be persisted/);
});
