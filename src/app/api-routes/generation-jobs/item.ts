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
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';
import { getSpeechGenerationProgress } from '@/modules/generation/server/speech-generation-submission';
import { readAuthServerConfig } from '@/shared/auth/config';
import { createCancelGenerationJobHandler } from './cancel-handler';

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
      ...(job.operation === 'generate_speech_long' ? { progress: await getSpeechGenerationProgress(job) } : {}),
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

export const cancelGenerationJobRequest = createCancelGenerationJobHandler({
  trustedOrigins: () => readAuthServerConfig().trustedOrigins,
  userId: async (request) => (await requireApiSession(request)).user.id,
  cancel: cancelGenerationJob, toPublic: toPublicGenerationJob, toErrorResponse: toGenerationJobApiError,
});

function invalidJobId() {
  return apiError('invalid_generation_job_id', 'Invalid generation job id.', 400);
}

function toGenerationJobApiError(error: unknown) {
  if (error instanceof GenerationJobNotFoundError) {
    return apiError('generation_job_not_found', error.message, 404);
  }
  return toApiErrorResponse(error);
}
