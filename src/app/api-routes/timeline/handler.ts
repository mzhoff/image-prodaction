import { z } from 'zod';
import { apiError } from '@/shared/api/api-error';
import { readBoundedBytes } from '@/shared/media/bounded-bytes';
import { timelineRequestSchema } from '@/shared/media/timeline-request';
import type { readTimelineJob, submitTimelineJob } from '@/modules/generation/server/timeline-job-service';
import { isUuidV7 } from '@/shared/lib/id';

interface Dependencies {
  userId(request: Request): Promise<string>;
  trustedOrigins(): string[];
  submit: typeof submitTimelineJob;
  read: typeof readTimelineJob;
  error(error: unknown): Response;
}
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Retry-After': '1' };
export function createTimelineRoutes(dependencies: Dependencies) {
  return {
    async post(request: Request) {
      try {
        const origin = request.headers.get('origin');
        if (!origin || !dependencies.trustedOrigins().includes(origin)) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
        const userId = await dependencies.userId(request);
        if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return apiError('invalid_content_type', 'JSON is required.', 415);
        let body: unknown;
        try { body = JSON.parse(new TextDecoder().decode(await readBoundedBytes(new Response(request.body, { headers: request.headers }), 512 * 1024, request.signal))); }
        catch { return apiError('invalid_timeline_request', 'The request is invalid or too large.', 400); }
        const result = await dependencies.submit(userId, timelineRequestSchema.parse(body));
        const pending = ['queued', 'running'].includes(result.job.status) || (result.job.status === 'failed' && result.job.error?.retryable);
        return Response.json(result, { status: pending ? 202 : 200, headers });
      } catch (error) { return error instanceof z.ZodError ? apiError('invalid_timeline_request', 'Review the video, shot ranges, model and language.', 400) : dependencies.error(error); }
    },
    async get(request: Request, jobId: string) {
      try {
        if (!isUuidV7(jobId)) return apiError('invalid_timeline_job', 'Invalid job id.', 400);
        const userId = await dependencies.userId(request);
        return Response.json(await dependencies.read(userId, jobId), { headers });
      } catch (error) { return dependencies.error(error); }
    },
  };
}
