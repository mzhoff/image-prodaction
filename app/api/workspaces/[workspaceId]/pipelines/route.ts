import { getWorkspacePipelines } from '@/app/api-routes/workspaces/pipelines';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getWorkspacePipelines(request, (await context.params).workspaceId);
}
