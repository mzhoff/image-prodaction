import { getGenerationJob, type GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { getWorkspaceVideoAsset } from '@/entities/asset/server/video-asset-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { MAX_TIMELINE_DURATION_MS, timelineAnalysisSchema, timelineDescriptionResultSchema } from '@/shared/media/timeline-contracts';
import { timelineRequestSchema, type TimelineRequest } from '@/shared/media/timeline-request';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { submitGenerationJob, toPublicGenerationJob } from './generation-submission-service';
import { readShortAiResultCheckpoint } from './short-ai-result-store';
import { timelinePayloadHash, type QueuedTimelinePayload, type TimelineResult } from './timeline-generation';
import { readTimelineAnalysisProgress } from './timeline-progress-store';

export function isTimelineJob(operation: string): boolean { return operation === 'timeline_analyze' || operation === 'timeline_describe'; }

export async function submitTimelineJob(userId: string, body: TimelineRequest) {
  const request = timelineRequestSchema.parse(body);
  await requireWorkspaceMembership(userId, request.workspaceId);
  const source = await getWorkspaceVideoAsset({ assetId: request.assetId, workspaceId: request.workspaceId });
  if (source.video.durationSeconds * 1000 > MAX_TIMELINE_DURATION_MS) throw new VideoProcessingError('timeline_duration_limit', 'Timeline Handoff supports videos up to 5 minutes.');
  if (request.action === 'describe') {
    if (request.sourceChecksum !== source.checksumSha256 || request.shots.some((shot) => shot.endMs > source.video.durationSeconds * 1000 + 1)) throw new VideoProcessingError('invalid_timeline_range', 'The reviewed shots do not match this video.');
    await resolveOpenRouterCredential(userId, request.workspaceId);
  }
  const payload: QueuedTimelinePayload = { request, sourceChecksum: source.checksumSha256, userId };
  const job = await submitGenerationJob({ userId, documentId: request.documentId, workspaceId: request.workspaceId,
    idempotencyKey: `timeline:${request.idempotencyKey}`, provider: request.action === 'describe' ? 'openrouter' : 'local',
    modelId: request.action === 'describe' ? request.model : 'ffmpeg-scdet-v1', operation: `timeline_${request.action}`,
    maxAttempts: 2, payload, metadata: { requestHash: timelinePayloadHash(payload), timelineVersion: 1,
      totalShots: request.action === 'describe' ? request.shots.length : null },
  });
  return timelineJobResponse(job);
}

export async function readTimelineJob(userId: string, jobId: string) {
  const job = await getGenerationJob(userId, jobId);
  return timelineJobResponse(job);
}

export async function timelineJobResponse(job: GenerationJobDto) {
  if (!isTimelineJob(job.operation)) throw new VideoProcessingError('timeline_job_not_found', 'Timeline job not found.', 404);
  const result = job.resultObjectKey ? parseTimelineResult(job.operation, await readShortAiResultCheckpoint(job.resultObjectKey)) : null;
  return { job: toPublicGenerationJob(job), result,
    progress: { completedShots: result && job.operation === 'timeline_describe' ? result.shots.length : 0, totalShots: job.metadata?.totalShots ?? null,
      analysis: readTimelineAnalysisProgress(job) },
    statusUrl: `/api/timeline/jobs/${job.id}`,
  };
}
export function parseTimelineResult(operation: string, value: unknown): TimelineResult {
  return operation === 'timeline_analyze' ? timelineAnalysisSchema.parse(value) : timelineDescriptionResultSchema.parse(value);
}
