import { getDocumentActivityRoute, postDocumentActivityRoute } from '@/modules/chat-assistant/server/document-activity-route';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ documentId: string }> }

export async function GET(request: Request, context: RouteContext) {
  return getDocumentActivityRoute(request, (await context.params).documentId);
}

export async function POST(request: Request, context: RouteContext) {
  return postDocumentActivityRoute(request, (await context.params).documentId);
}
