import { validateWorkspaceOpenRouter } from '@/app/api-routes/workspaces/providers';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return validateWorkspaceOpenRouter(request, (await context.params).workspaceId);
}
