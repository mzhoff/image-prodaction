import { loadVideoCatalog } from '@/modules/provider-connections/adapters/openrouter-video-catalog';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { toApiErrorResponse } from '@/app/api-routes/error-response';

export async function GET(request: Request) {
  try {
    await requireApiSession(request);
    return Response.json({ models: await loadVideoCatalog() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return toApiErrorResponse(error); }
}
