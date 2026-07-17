import { getWorkspaceAiUsage } from '@/app/api-routes/workspaces/ai-usage';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getWorkspaceAiUsage(request, (await context.params).workspaceId);
}
