import { postDiscardEmptyProject } from '@/app/api-routes/projects/item';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  return postDiscardEmptyProject(request, (await context.params).projectId);
}
