import assert from 'node:assert/strict';
import test from 'node:test';
import { readHomeImagePreviews } from './home-image-previews';

type Dependencies = NonNullable<Parameters<typeof readHomeImagePreviews>[2]>;
const principal = { userId: 'user', tenantId: 'workspace', productId: 'image-production' };
const id = '01900000-0000-7000-8000-000000000011';
const subjectId = '01900000-0000-7000-8000-000000000012';
const assetId = '01900000-0000-7000-8000-000000000013';
const record = { id, workspaceId: principal.tenantId, userId: principal.userId, conversationId: 'home:test', createdAt: new Date(),
  settings: { model: 'model', aspectRatio: '1:1', size: '1K', subjectIds: [subjectId] },
  subjects: [{ id: subjectId, name: 'Pinned name', revision: 1, passportText: 'Private passport',
    reference: { assetId, checksumSha256: 'private checksum', contentType: 'image/png' } }] };

test('history preview reads pinned snapshots after access check and exposes only name and primary asset', async () => {
  let authorized = false;
  const dependencies: Dependencies = {
    async requireConversation(actor, conversation) { assert.deepEqual(actor, principal); assert.equal(conversation, record.conversationId); authorized = true; return {} as never; },
    async lookup(actor, conversation, ids) {
      assert.ok(authorized); assert.deepEqual(actor, principal); assert.equal(conversation, record.conversationId); assert.deepEqual(ids, [id]);
      return [record, { ...record, workspaceId: 'foreign' }, { ...record, userId: 'other' }, { ...record, conversationId: 'other' }];
    },
  };
  const result = await readHomeImagePreviews(principal, { conversationId: record.conversationId, settingsIds: [id, id] }, dependencies);
  assert.deepEqual(result, { [id]: [{ id: subjectId, name: 'Pinned name', assetId }] });
});

test('no lookup for inaccessible conversations or invalid/oversized selector requests', async () => {
  let reads = 0;
  const deps: Dependencies = {
    async requireConversation() { throw new Error('Forbidden'); }, async lookup() { reads++; return [record]; },
  };
  await assert.rejects(readHomeImagePreviews(principal, { conversationId: 'home:test', settingsIds: [id] }, deps), /Forbidden/);
  for (const settingsIds of [[], ['bad-id'], Array(51).fill(id)]) {
    await assert.rejects(readHomeImagePreviews(principal, { conversationId: 'home:test', settingsIds }, deps));
  }
  assert.equal(reads, 0);
});
