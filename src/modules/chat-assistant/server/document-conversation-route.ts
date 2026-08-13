import { resolveChatPrincipal } from './auth';
import {
  bindDocumentConversation,
  DocumentConversationAccessError,
  findDocumentConversation,
} from './document-conversation-service';

export async function getDocumentConversationRoute(request: Request, documentId: string) {
  try {
    const principal = await resolveChatPrincipal(request);
    const conversationId = await findDocumentConversation(principal, normalizeId(documentId));
    return Response.json({ conversationId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return routeError(error);
  }
}

export async function putDocumentConversationRoute(request: Request, documentId: string) {
  try {
    const principal = await resolveChatPrincipal(request);
    const body = await request.json() as { conversationId?: unknown };
    const conversationId = normalizeId(body.conversationId);
    await bindDocumentConversation(principal, normalizeId(documentId), conversationId);
    return Response.json({ conversationId });
  } catch (error) {
    return routeError(error);
  }
}

function normalizeId(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 160) throw new DocumentConversationAccessError();
  return normalized;
}

function routeError(error: unknown) {
  if (error instanceof DocumentConversationAccessError) {
    return Response.json({ error: 'Document conversation was not found.' }, { status: 404 });
  }
  console.error('[document-conversation-route-error]', {
    errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error',
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return Response.json({ error: 'Document conversation is temporarily unavailable.' }, { status: 500 });
}
