import {
  getProjectPipelines,
  postProjectPipeline,
} from '@/app/api-routes/projects/pipelines';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getProjectPipelines(request, (await context.params).projectId);
}

export async function POST(request: Request, context: RouteContext) {
  return postProjectPipeline(request, (await context.params).projectId);
}
