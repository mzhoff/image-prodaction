import { videoStyleRequest } from '@/app/api-routes/workspaces/video-styles';
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  return videoStyleRequest(request, (await context.params).workspaceId);
}
