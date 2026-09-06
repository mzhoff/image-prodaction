import { handleWorkspaceRuntimeConnections } from '@/app/api-routes/workspaces/runtime-connections';

export const runtime = 'nodejs';
type Context = { params: Promise<{ workspaceId: string; path: string[] }> };
async function handle(request: Request, context: Context) {
  const { workspaceId, path } = await context.params;
  return handleWorkspaceRuntimeConnections(request, workspaceId, path);
}
export { handle as GET, handle as POST, handle as PATCH };
