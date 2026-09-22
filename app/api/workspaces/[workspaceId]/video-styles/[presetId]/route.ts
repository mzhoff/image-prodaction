import { videoStyleRequest } from '@/app/api-routes/workspaces/video-styles';
type Context = { params: Promise<{ workspaceId: string; presetId: string }> };
export async function PUT(request: Request, context: Context) {
  const { workspaceId, presetId } = await context.params;
  return videoStyleRequest(request, workspaceId, presetId);
}
export async function DELETE(request: Request, context: Context) {
  const { workspaceId, presetId } = await context.params;
  return videoStyleRequest(request, workspaceId, presetId);
}
