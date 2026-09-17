import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryConversationStore, PersistentConversationEventBus, type ConversationEventStore } from '@prodactionpro/chat-application';
import type { ChatStreamEvent } from '@prodactionpro/chat-sdk';
import type { DocumentAssistantActivity } from '../contracts/document-assistant-activity';
import { ensureCanonicalActivityConversation, persistDocumentActivityMessages } from './document-activity-chat-adapter';

const principal = { productId: 'image-production', tenantId: 'workspace', userId: 'user' };
const activity: DocumentAssistantActivity = { id: 'event-1', createdAt: '2026-09-12T14:00:00.000Z', kind: 'video-generated', nodeId: 'node-video', title: 'Видео готово', subtitle: 'Ровер завершил задачу' };

function fixture() {
  const store = new InMemoryConversationStore();
  // Apply the same unique IDs enforced by the installed PostgreSQL adapter.
  const conversationIds = new Set<string>();
  const messageIds = new Set<string>();
  const create = store.create.bind(store);
  store.create = async (input) => {
    if (conversationIds.has(input.id)) throw duplicate();
    conversationIds.add(input.id);
    return create(input);
  };
  const append = store.appendMessage.bind(store);
  store.appendMessage = async (message) => {
    if (messageIds.has(message.id)) throw duplicate();
    messageIds.add(message.id);
    return append(message);
  };
  const events = new Map<string, ChatStreamEvent>();
  let publishCount = 0;
  const eventStore: ConversationEventStore = {
    async append(_id, event) {
      publishCount++;
      const id = event.meta!.eventId;
      const stored = events.get(id) ?? event;
      events.set(id, stored);
      return stored;
    },
    async getLatestEventId() { return [...events.keys()].at(-1); },
    async listAfter() { return [...events.values()]; },
  };
  const eventBus = new PersistentConversationEventBus(eventStore);
  let bound: string | undefined;
  const ensure = () => ensureCanonicalActivityConversation({ principal, documentId: 'document', store,
    findBound: async () => bound, bind: async (id) => { bound ??= id; return bound; } });
  return { store, ensure, events, eventBus, publishCount: () => publishCount };
}

function duplicate() { return new Error('Query failed', { cause: { code: '23505' } }); }

test('two tabs establish one canonical conversation without an agent turn', async () => {
  const { store, ensure } = fixture();
  const ids = await Promise.all([ensure(), ensure()]);
  assert.equal(ids[0], ids[1]);
  assert.equal((await store.listConversations()).length, 1);
  const conversation = await store.findById(ids[0]!);
  assert.equal(conversation?.messageCount, 0);
  assert.equal(conversation?.totalTokens, 0);
  assert.deepEqual(conversation?.agentTurns, []);
});

test('an existing bound or legacy conversation is retained', async () => {
  const { store } = fixture();
  await store.create({ ...principal, id: 'legacy-conversation', mode: 'knowledge-base' });
  const id = await ensureCanonicalActivityConversation({ principal, documentId: 'document', store,
    findBound: async () => 'legacy-conversation', bind: async (value) => value });
  assert.equal(id, 'legacy-conversation');
  assert.equal((await store.listConversations()).length, 1);
});

test('concurrent backfill appends one assistant message and one durable event per activity', async () => {
  const { store, ensure, events, eventBus, publishCount } = fixture();
  const conversationId = await ensure();
  const input = { store, eventBus, principal, conversationId, activities: [activity] };
  await Promise.all([persistDocumentActivityMessages(input), persistDocumentActivityMessages(input)]);
  await persistDocumentActivityMessages(input);
  const messages = await store.listMessages(conversationId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.id, 'document-activity:event-1');
  assert.equal(messages[0]?.role, 'assistant');
  assert.equal(messages[0]?.createdAt, activity.createdAt);
  assert.equal((await store.findById(conversationId))?.messageCount, 1);
  assert.equal(events.size, 1);
  assert.equal(publishCount(), 1);
  const event = [...events.values()][0]!;
  assert.equal(event.event, 'message');
  assert.equal(event.meta?.eventId, 'document-activity-message:event-1');
  assert.equal(event.meta?.conversationId, conversationId);
  assert.deepEqual(event.data, messages[0]);
});

test('backfill includes events beyond the former first hundred', async () => {
  const { store, ensure, eventBus } = fixture();
  const conversationId = await ensure();
  const activities = Array.from({ length: 105 }, (_, i) => ({ ...activity, id: `event-${i}` }));
  await persistDocumentActivityMessages({ store, eventBus, principal, conversationId, activities });
  assert.equal((await store.listMessages(conversationId)).length, 105);
  assert.ok((await store.listMessages(conversationId)).some((message) => message.id === 'document-activity:event-104'));
});

test('a failed live publish keeps durable history available and refresh does not rebroadcast old messages', async () => {
  const { store, ensure, events, eventBus } = fixture();
  const conversationId = await ensure();
  const input = { store, principal, conversationId, activities: [activity] };
  const errors: unknown[] = [];
  await persistDocumentActivityMessages({ ...input, eventBus: { publish() { throw new Error('temporary event failure'); } }, onPublishError: (error) => errors.push(error) });
  assert.equal(errors.length, 1);
  assert.equal((await store.listMessages(conversationId)).length, 1);
  await persistDocumentActivityMessages({ ...input, eventBus });
  assert.equal((await store.listMessages(conversationId)).length, 1);
  assert.equal(events.size, 0);
});

test('foreign users/workspaces and non-unique storage failures remain rejected', async () => {
  const { store, ensure, eventBus } = fixture();
  const conversationId = await ensure();
  for (const foreign of [{ ...principal, userId: 'other' }, { ...principal, tenantId: 'other' }]) {
    await assert.rejects(persistDocumentActivityMessages({ store, eventBus, principal: foreign, conversationId, activities: [activity] }));
  }
  assert.equal((await store.listMessages(conversationId)).length, 0);
  store.appendMessage = async () => { throw new Error('disk failure'); };
  await assert.rejects(persistDocumentActivityMessages({ store, eventBus, principal, conversationId, activities: [activity] }), /disk failure/);
});
