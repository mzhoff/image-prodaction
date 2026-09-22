import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryConversationStore } from '@prodactionpro/chat-application';
import { createTextMessage } from '@prodactionpro/chat-domain';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { findTimelineConversation, restoreTimelineConversation, timelineConversationId, timelineIdFromConversation, verifiedTimelineContext } from './timeline-conversation';

const principal = { productId: 'image-production', tenantId: 'workspace-1', userId: 'user-1' };
const timelineId = '01a0bdb4-59e2-7ab2-862c-0520e387bb5d';
const otherId = '01a0bdb4-59e2-7ab2-862c-0520e387bb5e';
function fixture() {
  const store = new InMemoryConversationStore();
  const document: TimelineDocument = { id: timelineId, workspaceId: principal.tenantId, name: 'Мой монтаж',
    folderId: null, storyboardId: null, revision: 4, createdAt: '2026-09-21T00:00:00Z', updatedAt: '2026-09-21T00:00:00Z',
    snapshot: { schemaVersion: 1, aspectRatio: '9:16', frameRate: 24, clips: [] } };
  let reads = 0;
  const dependencies = { store, timeline: async (userId: string, id: string) => {
    assert.equal(userId, principal.userId); assert.equal(id, timelineId); reads += 1; return document;
  } };
  return { store, document, dependencies, reads: () => reads };
}

test('Opening a Timeline is read-only until the first explicit submission', async () => {
  const f = fixture();
  assert.equal(await findTimelineConversation(principal, timelineId, f.dependencies), undefined);
  assert.equal(await findTimelineConversation(principal, timelineId, f.dependencies), undefined);
  assert.equal(await f.store.findById(timelineConversationId(principal, timelineId)), null);
  const id = await restoreTimelineConversation(principal, timelineId, f.dependencies);
  assert.equal(await findTimelineConversation(principal, timelineId, f.dependencies), id);
  assert.equal(await restoreTimelineConversation(principal, timelineId, f.dependencies), id);
});

test('Timeline conversation restores the same history, including a recoverable failed turn', async () => {
  const f = fixture();
  const id = await restoreTimelineConversation(principal, timelineId, f.dependencies);
  await f.store.appendMessage(createTextMessage({ conversationId: id, role: 'user', content: 'Соберём ролик на 15 секунд' }));
  const existing = await f.store.findById(id); assert.ok(existing);
  f.store.findById = async () => ({ ...existing, status: 'error' });
  assert.equal(await restoreTimelineConversation(principal, timelineId, f.dependencies), id);
  assert.equal((await f.store.listMessages(id)).length, 1);
  assert.equal(timelineIdFromConversation(id), timelineId);
  assert.notEqual(timelineConversationId(principal, otherId), id);
  assert.notEqual(timelineConversationId({ ...principal, userId: 'user-2' }, timelineId), id);
  assert.notEqual(timelineConversationId({ ...principal, tenantId: 'workspace-2' }, timelineId), id);
});

test('Every Timeline context read checks current document access and reads the latest saved revision', async () => {
  const f = fixture(); const id = await restoreTimelineConversation(principal, timelineId, f.dependencies);
  assert.equal((await verifiedTimelineContext(principal, id, f.dependencies))?.revision, 4);
  f.document.revision = 5; f.document.snapshot.aspectRatio = '1:1';
  assert.equal((await verifiedTimelineContext(principal, id, f.dependencies))?.aspectRatio, '1:1');
  assert.equal(f.reads(), 3);
  f.dependencies.timeline = async () => { throw new Error('Membership revoked'); };
  await assert.rejects(() => verifiedTimelineContext(principal, id, f.dependencies), /Membership revoked/);
});

test('A forged Timeline binding, foreign workspace or conversation owner cannot provide assistant context', async () => {
  const f = fixture(); const id = await restoreTimelineConversation(principal, timelineId, f.dependencies);
  for (const actor of [{ ...principal, userId: 'user-2' }, { ...principal, tenantId: 'workspace-2' }, { ...principal, productId: 'other' }]) {
    await assert.rejects(() => verifiedTimelineContext(actor, id, f.dependencies));
  }
  await assert.rejects(() => verifiedTimelineContext(principal, `timeline:${otherId}:${id.split(':')[2]}`, f.dependencies), /не привязан/);
  assert.equal(f.reads(), 1, 'foreign IDs are rejected before reading any document');
  f.document.workspaceId = 'foreign';
  await assert.rejects(() => verifiedTimelineContext(principal, id, f.dependencies), /недоступен/);
  await assert.rejects(() => restoreTimelineConversation(principal, timelineId, f.dependencies), /недоступен/);
  f.document.workspaceId = principal.tenantId;
  const existing = await f.store.findById(id); assert.ok(existing);
  f.store.findById = async () => ({ ...existing, userId: 'someone-else' });
  await assert.rejects(() => verifiedTimelineContext(principal, id, f.dependencies), /another/);
});

test('Unbound, malformed and archived conversations fail closed; other chat kinds are ignored', async () => {
  const f = fixture(); const id = timelineConversationId(principal, timelineId);
  await assert.rejects(() => verifiedTimelineContext(principal, id, f.dependencies), /недоступен/);
  for (const invalid of ['timeline:', 'timeline:not-a-uuid:hash', `${id}:extra`]) {
    assert.equal(timelineIdFromConversation(invalid), undefined);
    await assert.rejects(() => verifiedTimelineContext(principal, invalid, f.dependencies), /не привязан/);
  }
  assert.equal(await verifiedTimelineContext(principal, 'home:existing', f.dependencies), undefined);
  await restoreTimelineConversation(principal, timelineId, f.dependencies);
  const existing = await f.store.findById(id); assert.ok(existing);
  f.store.findById = async () => ({ ...existing, status: 'archived' });
  await assert.rejects(() => verifiedTimelineContext(principal, id, f.dependencies), /недоступен/);
});
