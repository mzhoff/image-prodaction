'use client';

export async function loadBoundDocumentConversation(input: {
  documentId: string;
  signal?: AbortSignal;
  workspaceId: string;
}) {
  const response = await fetch(createUrl(input.documentId), {
    cache: 'no-store',
    headers: { 'x-workspace-id': input.workspaceId },
    signal: input.signal,
  });
  if (!response.ok) throw new Error('Не удалось восстановить историю ассистента.');
  const body = await response.json() as { conversationId?: unknown };
  return typeof body.conversationId === 'string' ? body.conversationId : undefined;
}

export async function bindDocumentConversation(input: {
  conversationId: string;
  documentId: string;
  signal?: AbortSignal;
  workspaceId: string;
}) {
  const response = await fetch(createUrl(input.documentId), {
    body: JSON.stringify({ conversationId: input.conversationId }),
    headers: {
      'content-type': 'application/json',
      'x-workspace-id': input.workspaceId,
    },
    method: 'PUT',
    signal: input.signal,
  });
  if (!response.ok) throw new Error('Не удалось привязать историю ассистента к документу.');
}

function createUrl(documentId: string) {
  return `/api/product-chat/documents/${encodeURIComponent(documentId)}/conversation`;
}
