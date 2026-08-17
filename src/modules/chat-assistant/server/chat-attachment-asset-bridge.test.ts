import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ChatAttachmentApplicationService,
  ConversationStore,
} from '@prodactionpro/chat-application';
import { createTextMessage, type Conversation } from '@prodactionpro/chat-domain';
import { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge.ts';

test('resolves import indices against the latest user message with managed images', async () => {
  const conversation = {
    id: 'conversation-1',
    productId: 'image-production',
    tenantId: 'workspace-1',
    userId: 'user-1',
  } as Conversation;
  const older = createTextMessage({ content: 'Older', conversationId: conversation.id, role: 'user' });
  older.metadata = { attachments: [reference('attachment-old', 'old.webp')] };
  const latest = createTextMessage({ content: 'Use these', conversationId: conversation.id, role: 'user' });
  latest.metadata = {
    attachments: [
      reference('attachment-a', 'first.webp'),
      reference('attachment-b', 'second.webp'),
    ],
  };
  let assertedIds: string[] = [];
  const conversations = {
    findById: async () => conversation,
    listMessages: async () => [older, latest],
  } as unknown as ConversationStore;
  const attachments = {
    assertReadyReferences: async (refs: Array<{ attachmentId: string }>) => {
      assertedIds = refs.map((item) => item.attachmentId);
    },
  } as unknown as ChatAttachmentApplicationService;
  const bridge = new ChatAttachmentAssetBridge(conversations, attachments);

  const resolved = await bridge.resolveLatestImports(conversation.id, [{
    attachmentIndex: 1,
    nodeId: 'import-node',
  }], {
    productId: 'image-production',
    tenantId: 'workspace-1',
    userId: 'user-1',
  });

  assert.deepEqual(resolved, [{
    attachmentId: 'attachment-b',
    attachmentIndex: 1,
    attachmentName: 'second.webp',
    nodeId: 'import-node',
  }]);
  assert.deepEqual(assertedIds, ['attachment-b']);
});

test('does not resolve attachments from a conversation owned by another user', async () => {
  const conversations = {
    findById: async () => ({
      id: 'conversation-1',
      productId: 'image-production',
      tenantId: 'workspace-1',
      userId: 'other-user',
    }),
  } as unknown as ConversationStore;
  const bridge = new ChatAttachmentAssetBridge(
    conversations,
    {} as ChatAttachmentApplicationService,
  );

  await assert.rejects(() => bridge.resolveLatestImports('conversation-1', [{
    attachmentIndex: 0,
    nodeId: 'import-node',
  }], {
    productId: 'image-production',
    tenantId: 'workspace-1',
    userId: 'user-1',
  }), /belongs to another user/i);
});

function reference(attachmentId: string, name: string) {
  return {
    attachmentId,
    kind: 'image' as const,
    mimeType: 'image/webp',
    name,
    sizeBytes: 1_024,
  };
}
