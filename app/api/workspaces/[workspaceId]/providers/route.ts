import { getWorkspaceProviders } from '@/app/api-routes/workspaces/providers';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getWorkspaceProviders(request, (await context.params).workspaceId);
}
