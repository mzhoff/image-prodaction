import { getPipelinePlaygroundDescriptor } from '@/modules/executable-pipelines/server/pipeline-playground-service';
import { parsePipelinePlaygroundEndpoint } from '@/modules/executable-pipelines/core/pipeline-playground-endpoint';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { toPipelinePlaygroundErrorResponse } from './error-response';

export async function getPipelinePlaygroundDescriptorResponse(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const endpoint = requestUrl.searchParams.get('endpoint');
    if (!endpoint) return apiError('missing_pipeline_endpoint', 'Pipeline endpoint is required.', 400);
    const publicId = parsePipelinePlaygroundEndpoint(endpoint, requestUrl.origin);
    const session = await requireApiSession(request);
    const descriptor = await getPipelinePlaygroundDescriptor({
      publicId,
      userId: session.user.id,
    });
    return Response.json({ pipeline: descriptor }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toPipelinePlaygroundErrorResponse(error);
  }
}
