import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import {
  GenerationJobNotFoundError,
  getGenerationJob,
} from '@/entities/generation/server/generation-orchestrator';
import {
  cancelGenerationJob,
  toPublicGenerationJob,
} from '@/modules/generation/server/generation-submission-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function getGenerationJobRequest(request: Request, jobId: string) {
  try {
    if (!isUuidV7(jobId)) return invalidJobId();
    const session = await requireApiSession(request);
    const job = await getGenerationJob(session.user.id, jobId);
    const asset = job.status === 'succeeded' && job.finalAssetId
      ? await getAssetMetadata(session.user.id, job.finalAssetId)
      : null;
    return Response.json({
      job: toPublicGenerationJob(job),
      asset,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': job.status === 'queued' || job.status === 'running' ? '1' : '0',
      },
    });
  } catch (error) {
    return toGenerationJobApiError(error);
  }
}

export async function cancelGenerationJobRequest(request: Request, jobId: string) {
  try {
    if (!isUuidV7(jobId)) return invalidJobId();
    const session = await requireApiSession(request);
    const job = await cancelGenerationJob(session.user.id, jobId);
    return Response.json({ job: toPublicGenerationJob(job) });
  } catch (error) {
    return toGenerationJobApiError(error);
  }
}

function invalidJobId() {
  return apiError('invalid_generation_job_id', 'Invalid generation job id.', 400);
}

function toGenerationJobApiError(error: unknown) {
  if (error instanceof GenerationJobNotFoundError) {
    return apiError('generation_job_not_found', error.message, 404);
  }
  return toApiErrorResponse(error);
}
