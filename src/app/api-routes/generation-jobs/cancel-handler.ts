import { apiError } from '@/shared/api/api-error';
import { isUuidV7 } from '@/shared/lib/id';
import type { cancelGenerationJob, toPublicGenerationJob } from '@/modules/generation/server/generation-submission-service';

interface CancelDependencies {
  trustedOrigins(): string[];
  userId(request: Request): Promise<string>;
  cancel: typeof cancelGenerationJob;
  toPublic: typeof toPublicGenerationJob;
  toErrorResponse(error: unknown): Response;
}

/** Session-authenticated cancellation is a browser mutation, not a service-token API. */
export function createCancelGenerationJobHandler(dependencies: CancelDependencies) {
  return async (request: Request, jobId: string) => {
    try {
      const origin = request.headers.get('origin');
      if (!origin || !dependencies.trustedOrigins().includes(origin)) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
      if (!isUuidV7(jobId)) return apiError('invalid_generation_job_id', 'Invalid generation job id.', 400);
      const userId = await dependencies.userId(request);
      // The existing cancellation service resolves accessible job/workspace server-side.
      const job = await dependencies.cancel(userId, jobId);
      return Response.json({ job: dependencies.toPublic(job) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return dependencies.toErrorResponse(error); }
  };
}
