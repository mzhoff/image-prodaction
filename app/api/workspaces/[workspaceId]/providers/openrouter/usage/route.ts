import { getWorkspaceOpenRouterUsage } from '@/app/api-routes/workspaces/providers';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getWorkspaceOpenRouterUsage(request, (await context.params).workspaceId);
}
