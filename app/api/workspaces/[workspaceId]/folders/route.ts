import { folderRequest } from '@/app/api-routes/workspaces/folders';
type Context = { params: Promise<{ workspaceId: string }> };
export async function GET(request: Request, context: Context) { return folderRequest(request, (await context.params).workspaceId); }
export async function POST(request: Request, context: Context) { return folderRequest(request, (await context.params).workspaceId); }
