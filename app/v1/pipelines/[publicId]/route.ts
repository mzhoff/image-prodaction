import { getPipelineRuntimeDescriptor } from '@/modules/executable-pipelines/server/pipeline-runtime-api';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ publicId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  return getPipelineRuntimeDescriptor(request, (await context.params).publicId);
}
