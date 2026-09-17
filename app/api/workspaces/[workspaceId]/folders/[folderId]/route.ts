import { folderRequest } from '@/app/api-routes/workspaces/folders';
type Context = { params: Promise<{ workspaceId: string; folderId: string }> };
async function handler(request: Request, context: Context) { const { workspaceId, folderId } = await context.params; return folderRequest(request, workspaceId, folderId); }
export { handler as PATCH, handler as DELETE };
