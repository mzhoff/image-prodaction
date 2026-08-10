import { postProjectThumbnail } from '@/app/api-routes/projects/thumbnail';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return postProjectThumbnail(request, (await context.params).projectId);
}
