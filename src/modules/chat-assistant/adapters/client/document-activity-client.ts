'use client';

import type { DocumentAssistantActivity, DocumentAssistantEventKind } from '../../contracts/document-assistant-activity';

function createUrl(documentId: string) {
  return `/api/product-chat/documents/${encodeURIComponent(documentId)}/activity`;
}

export async function loadDocumentAssistantActivity(input: { documentId: string; workspaceId: string; signal?: AbortSignal }) {
  const response = await fetch(createUrl(input.documentId), {
    cache: 'no-store', headers: { 'x-workspace-id': input.workspaceId }, signal: input.signal,
  });
  if (!response.ok) throw new Error('Не удалось загрузить события документа.');
  const body = await response.json() as { events?: DocumentAssistantActivity[] };
  return Array.isArray(body.events) ? body.events : [];
}

export async function recordDocumentAssistantActivity(input: {
  documentId: string; workspaceId: string; nodeId: string; kind: DocumentAssistantEventKind; model?: string; assetId: string;
}) {
  const response = await fetch(createUrl(input.documentId), {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-id': input.workspaceId },
    body: JSON.stringify({ kind: input.kind, nodeId: input.nodeId, model: input.model, assetId: input.assetId }),
  });
  if (!response.ok) throw new Error('Не удалось сохранить событие документа.');
  window.dispatchEvent(new CustomEvent('image-production:document-activity-updated', {
    detail: { documentId: input.documentId },
  }));
}
