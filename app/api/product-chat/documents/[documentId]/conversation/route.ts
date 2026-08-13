import {
  getDocumentConversationRoute,
  putDocumentConversationRoute,
} from '@/modules/chat-assistant/server/document-conversation-route';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getDocumentConversationRoute(request, (await context.params).documentId);
}

export async function PUT(request: Request, context: RouteContext) {
  return putDocumentConversationRoute(request, (await context.params).documentId);
}
