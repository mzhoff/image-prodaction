import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { getTimelineFrame } from '@/modules/generation/server/timeline-frames';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import { readTimelineJob, submitTimelineJob } from '@/modules/generation/server/timeline-job-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { GenerationIdempotencyConflictError, GenerationJobNotFoundError } from '@/entities/generation/server/generation-orchestrator';
import { ProviderConnectionNotConfiguredError } from '@/modules/provider-connections/server/provider-connection-service';
import { readAuthServerConfig } from '@/shared/auth/config';
import { apiError } from '@/shared/api/api-error';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import { toAssetApiErrorResponse } from '../assets/error-response';
import { createTimelineRoutes } from './handler';
import { createTimelineFrameRequest } from './frame-handler';

const routes = createTimelineRoutes({
  userId: async (request) => (await requireApiSession(request)).user.id,
  trustedOrigins: () => readAuthServerConfig().trustedOrigins,
  submit: submitTimelineJob, read: readTimelineJob, error: timelineError,
});
export const postTimeline = routes.post;
export const getTimelineJob = routes.get;
export const getTimelineFrameRequest = createTimelineFrameRequest({
  userId: async (request) => (await requireApiSession(request)).user.id,
  authorize: requireWorkspaceMembership, frame: getTimelineFrame, metadata: getAssetMetadata, error: timelineError,
});
function timelineError(error: unknown) {
  if (error instanceof VideoProcessingError || error instanceof AudioProcessingError) return apiError(error.code, error.message, error.status);
  if (error instanceof GenerationJobNotFoundError) return apiError('timeline_job_not_found', 'Timeline job not found.', 404);
  if (error instanceof GenerationIdempotencyConflictError) return apiError('timeline_request_conflict', 'This request key belongs to different settings.', 409);
  if (error instanceof ProviderConnectionNotConfiguredError) return apiError(error.code, error.message, 409);
  return toAssetApiErrorResponse(error);
}
