import { createHash } from 'node:crypto';
import { MAX_TIMELINE_DURATION_MS, TIMELINE_VERSION, timelineAnalysisSchema, timelineShotFingerprint, type TimelineAnalysis, type TimelineDescriptionResult } from '@/shared/media/timeline-contracts';
import { timelineRequestSchema, type TimelineRequest } from '@/shared/media/timeline-request';
import { analyzeTimelineVideo, withTimelineFrameReader } from '@/shared/media/timeline-processor';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import type { TimelineAnalysisProgress } from '@/shared/media/timeline-progress';
import { readWorkspaceVideoAsset } from '@/entities/asset/server/video-asset-service';
import { describeTimelineShot } from './timeline-description';
import { getTimelineFrame } from './timeline-frames';

export interface QueuedTimelinePayload { request: TimelineRequest; sourceChecksum: string; userId: string }
export type TimelineResult = TimelineAnalysis | TimelineDescriptionResult;
export function timelinePayloadHash(payload: QueuedTimelinePayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
export interface TimelineGenerationDependencies {
  readSource: typeof readWorkspaceVideoAsset;
  analyze: typeof analyzeTimelineVideo;
  frame: typeof getTimelineFrame;
  describe: typeof describeTimelineShot;
  withFrames: typeof withTimelineFrameReader;
}
const defaults: TimelineGenerationDependencies = { readSource: readWorkspaceVideoAsset, analyze: analyzeTimelineVideo, frame: getTimelineFrame, describe: describeTimelineShot, withFrames: withTimelineFrameReader };

/** Both stages are server jobs. A paid stage is never inferred from detection or editing. */
export async function generateTimeline(input: {
  payload: QueuedTimelinePayload; jobId: string; signal: AbortSignal; previous?: TimelineResult | null;
  assertActive(): Promise<void>; checkpoint(result: TimelineResult): Promise<void>;
  onProgress?(value: TimelineAnalysisProgress): Promise<void>;
}, dependencies = defaults): Promise<TimelineResult> {
  const request = timelineRequestSchema.parse(input.payload.request);
  const startedAt = Date.now();
  await input.assertActive();
  if (request.action === 'analyze') await input.onProgress?.({ phase: 'reading', processedFrames: 0, totalFrames: null, processedMs: 0, totalMs: 0, elapsedMs: 0, estimatedRemainingMs: null });
  const source = await dependencies.readSource({ assetId: request.assetId, workspaceId: request.workspaceId, signal: input.signal });
  if (source.asset.checksumSha256 !== input.payload.sourceChecksum) throw new VideoProcessingError('timeline_source_changed', 'The source video changed; analyze it again.');
  if (source.video.durationSeconds * 1000 > MAX_TIMELINE_DURATION_MS) throw new VideoProcessingError('timeline_duration_limit', 'Timeline Handoff supports videos up to 5 minutes.');
  if (request.action === 'analyze') {
    const analysis = await dependencies.analyze({ bytes: source.bytes, threshold: request.threshold, signal: input.signal,
      onProgress: input.onProgress ? (value) => input.onProgress!({ ...value, elapsedMs: Date.now() - startedAt }) : undefined });
    const result = timelineAnalysisSchema.parse({ ...analysis, version: TIMELINE_VERSION,
      sourceAssetId: source.asset.id, sourceChecksum: source.asset.checksumSha256,
      shots: analysis.shots.map((shot, index) => ({ id: `shot-${index + 1}`, startMs: shot.startMs, endMs: shot.endMs,
        frames: shot.frameTimesMs.map((timeMs) => ({ timeMs })), description: '' })),
    });
    await input.assertActive();
    await input.checkpoint(result);
    return result;
  }
  if (request.sourceChecksum !== source.asset.checksumSha256 || request.shots.some((shot) => shot.endMs > source.video.durationSeconds * 1000 + 1)) {
    throw new VideoProcessingError('invalid_timeline_range', 'The reviewed shots do not match this video.');
  }
  const previous = input.previous && !('version' in input.previous) ? input.previous : undefined;
  const result: TimelineDescriptionResult = { sourceAssetId: source.asset.id, sourceChecksum: source.asset.checksumSha256, shots: [] };
  if (previous) {
    if (previous.sourceAssetId !== result.sourceAssetId || previous.sourceChecksum !== result.sourceChecksum
      || previous.shots.some((done) => !request.shots.some((shot) => shot.id === done.id && timelineShotFingerprint(shot) === done.describedFingerprint))) {
      throw new VideoProcessingError('invalid_timeline_checkpoint', 'The saved descriptions do not match the reviewed shots.');
    }
    result.shots = [...previous.shots];
  }
  if (result.shots.length === request.shots.length) return result;
  return dependencies.withFrames({ bytes: source.bytes, signal: input.signal }, async (extract) => {
    for (const shot of request.shots) {
    input.signal.throwIfAborted();
    await input.assertActive();
    if (result.shots.some((done) => done.id === shot.id)) continue;
    const ordered = [...shot.frames].sort((a, b) => a.timeMs - b.timeMs);
    const images: Uint8Array[] = [];
    const frames: Array<{ timeMs: number; assetId: string }> = [];
    for (const frame of ordered) {
      const prepared = await dependencies.frame({ userId: input.payload.userId, workspaceId: request.workspaceId,
        assetId: source.asset.id, timeMs: frame.timeMs, signal: input.signal, sourceBytes: source.bytes, extract });
      images.push(prepared.bytes); frames.push({ timeMs: frame.timeMs, assetId: prepared.assetId });
    }
    await input.assertActive();
    const description = await dependencies.describe({ shot, images, model: request.model, language: request.language,
      actorUserId: input.payload.userId, documentId: request.documentId, workspaceId: request.workspaceId,
      parentJobId: input.jobId, signal: input.signal });
    await input.assertActive();
    result.shots.push({ ...description, frames });
    await input.checkpoint(result);
    }
    return result;
  });
}
