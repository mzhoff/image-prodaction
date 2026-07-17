import {
  connectWorkspaceOpenRouter,
  disconnectWorkspaceOpenRouter,
} from '@/app/api-routes/workspaces/providers';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return connectWorkspaceOpenRouter(request, (await context.params).workspaceId);
}

export async function DELETE(request: Request, context: RouteContext) {
  return disconnectWorkspaceOpenRouter(request, (await context.params).workspaceId);
}
