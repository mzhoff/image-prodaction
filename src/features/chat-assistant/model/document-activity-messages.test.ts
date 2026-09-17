import assert from 'node:assert/strict';
import test from 'node:test';
import { chatMessageSchema, type ChatActionSelection, type ChatMessage } from '@prodactionpro/chat-domain';
import { documentActivityToChatMessage } from '@/modules/chat-assistant/contracts/document-activity-message';
import type { DocumentAssistantActivity } from '@/modules/chat-assistant/contracts/document-assistant-activity';
import { getDocumentActivityActionNode, mergeDocumentActivityMessages } from './document-activity-messages';
import { prepareChatMessagesForPresentation } from './chat-message-presentation';

const activity: DocumentAssistantActivity = {
  id: 'event-1', nodeId: 'image-node', kind: 'image-generated',
  createdAt: '2026-09-12T12:00:00.000Z', title: 'Изображение готово', subtitle: 'Ровер завершил задачу · model',
};

test('generation completion is a valid durable assistant message with its original timestamp and node action', () => {
  const message = documentActivityToChatMessage(activity, 'conversation');
  assert.equal(chatMessageSchema.safeParse(message).success, true);
  assert.equal(message.role, 'assistant');
  assert.equal(message.createdAt, activity.createdAt);
  assert.equal(message.conversationId, 'conversation');
  assert.deepEqual(documentActivityToChatMessage(activity, 'conversation'), message);
  assert.equal(prepareChatMessagesForPresentation([message])[0]?.metadata?.animate, false);
});

test('live notifications and restored history form one chronology without duplicating completed messages', () => {
  const before: ChatMessage = { id: 'before', role: 'user', createdAt: '2026-09-12T11:00:00Z', blocks: [{ type: 'text', content: 'Создай изображение' }] };
  const after: ChatMessage = { id: 'after', role: 'assistant', createdAt: '2026-09-12T13:00:00Z', blocks: [{ type: 'text', content: 'Продолжающийся ответ' }] };
  const saved = documentActivityToChatMessage(activity, 'conversation');
  const history = [before, saved, after];
  const merged = mergeDocumentActivityMessages(history, [activity, { ...activity, id: 'video', kind: 'video-generated', createdAt: '2026-09-12T12:30:00Z' }], 'conversation');
  assert.deepEqual(merged.map((message) => message.id), ['before', saved.id, 'document-activity:video', 'after']);
  assert.equal(merged[1], saved);
  assert.equal(merged[3], after);
  assert.deepEqual(history, [before, saved, after]);
});

test('node navigation survives history serialization and rejects unrelated actions or a mismatched node', () => {
  const message = chatMessageSchema.parse(JSON.parse(JSON.stringify(documentActivityToChatMessage(activity, 'conversation'))));
  const block = message.blocks[1];
  assert.ok(block?.type === 'quick-replies');
  const action = block.actions[0];
  assert.ok(action);
  const selection: ChatActionSelection = { ...action, source: { messageId: message.id, blockIndex: 1, blockType: block.type } };
  assert.equal(getDocumentActivityActionNode(selection, [message]), 'image-node');
  assert.equal(getDocumentActivityActionNode({ ...selection, params: { nodeId: 'other-node' } }, [message]), undefined);
  assert.equal(getDocumentActivityActionNode({ ...selection, source: { messageId: 'unrelated' } }, [message]), undefined);
  assert.equal(getDocumentActivityActionNode({ ...selection, type: 'submit' }, [message]), undefined);
  assert.equal(getDocumentActivityActionNode(selection, [{ ...message, metadata: {} }]), undefined);
});

test('all completion messages remain available beyond the former 100-event limit', () => {
  const activities = Array.from({ length: 125 }, (_, i) => ({ ...activity, id: `event-${i}` }));
  const messages = mergeDocumentActivityMessages([], activities);
  assert.equal(messages.length, 125);
  assert.equal(messages.at(-1)?.id, 'document-activity:event-124');
});
