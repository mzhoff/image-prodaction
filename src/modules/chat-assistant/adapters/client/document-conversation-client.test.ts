import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindDocumentConversation,
  loadBoundDocumentConversation,
} from './document-conversation-client.ts';

test('loads and binds a document conversation with the workspace boundary', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string; workspace: string | null }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({
      method: init?.method ?? 'GET',
      url: String(input),
      workspace: new Headers(init?.headers).get('x-workspace-id'),
    });
    return Response.json({ conversationId: 'conversation-1' });
  }) as typeof fetch;

  try {
    assert.equal(await loadBoundDocumentConversation({
      documentId: 'document/1',
      workspaceId: 'workspace-1',
    }), 'conversation-1');
    await bindDocumentConversation({
      conversationId: 'conversation-1',
      documentId: 'document/1',
      workspaceId: 'workspace-1',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { method: 'GET', url: '/api/product-chat/documents/document%2F1/conversation', workspace: 'workspace-1' },
    { method: 'PUT', url: '/api/product-chat/documents/document%2F1/conversation', workspace: 'workspace-1' },
  ]);
});
