import { resolveChatPrincipal } from './auth';
import { isUuid } from '@/shared/lib/id';
import {
  listDocumentAssistantActivity,
  recordDocumentAssistantActivity,
  type DocumentAssistantEventKind,
} from './document-activity-service';
import { DocumentConversationAccessError } from './document-conversation-service';

export async function getDocumentActivityRoute(request: Request, documentId: string) {
  try {
    return Response.json({ events: await listDocumentAssistantActivity(await resolveChatPrincipal(request), normalizeId(documentId)) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) { return routeError(error); }
}

export async function postDocumentActivityRoute(request: Request, documentId: string) {
  try {
    const body = await request.json() as { kind?: unknown; nodeId?: unknown; model?: unknown; assetId?: unknown };
    const kind = body.kind === 'image-generated' || body.kind === 'video-generated'
      ? body.kind as DocumentAssistantEventKind : undefined;
    if (!kind) throw new DocumentConversationAccessError();
    const nodeId = normalizeId(body.nodeId);
    const model = typeof body.model === 'string' && body.model.length <= 200 ? body.model : undefined;
    if (body.assetId !== undefined && !isUuid(body.assetId)) throw new DocumentConversationAccessError();
    const assetId = typeof body.assetId === 'string' ? body.assetId.toLowerCase() : undefined;
    const event = await recordDocumentAssistantActivity(await resolveChatPrincipal(request), {
      documentId: normalizeId(documentId), kind, nodeId, model, assetId,
    });
    return Response.json({ event }, { status: 201 });
  } catch (error) { return routeError(error); }
}

function normalizeId(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 160) throw new DocumentConversationAccessError();
  return normalized;
}

function routeError(error: unknown) {
  if (error instanceof DocumentConversationAccessError) return Response.json({ error: 'Document activity was not found.' }, { status: 404 });
  console.error('[document-activity-route-error]', { errorName: error instanceof Error ? error.name : 'UnknownError' });
  return Response.json({ error: 'Document activity is temporarily unavailable.' }, { status: 500 });
}
