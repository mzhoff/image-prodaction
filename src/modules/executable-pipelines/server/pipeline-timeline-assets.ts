import { z } from 'zod';
import { getTimelineOutputShots, timelineOutputFrameAssetIds } from '@/shared/media/timeline-output';
import { videoTrimRangeSchema } from '@/shared/media/video-contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { timelineAnalysisSchema, type TimelineAnalysis } from '@/shared/media/timeline-contracts';
import type { CompiledPipelinePlan, PipelineValue } from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';

export type TimelineStoredAsset = Pick<typeof asset.$inferSelect,
  'id' | 'workspaceId' | 'status' | 'mediaKind' | 'checksumSha256' | 'contentType' | 'byteSize' | 'operation' | 'metadata'>;
export type TimelineAssetReader = (workspaceId: string, assetIds: string[]) => Promise<TimelineStoredAsset[]>;

export const readTimelineAssets: TimelineAssetReader = async (workspaceId, ids) => getDb().select({
  id: asset.id, workspaceId: asset.workspaceId, status: asset.status, mediaKind: asset.mediaKind,
  checksumSha256: asset.checksumSha256, contentType: asset.contentType, byteSize: asset.byteSize,
  operation: asset.operation, metadata: asset.metadata,
}).from(asset).where(and(eq(asset.workspaceId, workspaceId), inArray(asset.id, ids)));

export function timelineAssetIds(analysis: TimelineAnalysis) {
  return [...new Set([analysis.sourceAssetId, ...analysis.shots.flatMap((shot) => shot.frames.flatMap((frame) => frame.assetId ? [frame.assetId] : []))])];
}

/** Validate real server-owned asset provenance, never trust client-supplied frame ids. */
export async function validateTimelineAssets(analysis: TimelineAnalysis, workspaceId: string, read: TimelineAssetReader = readTimelineAssets) {
  const ids = timelineAssetIds(analysis);
  const rows = await read(workspaceId, ids);
  const records = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const record = records.get(id);
    if (!record || record.workspaceId !== workspaceId || record.status !== 'ready' || !/^[a-f0-9]{64}$/i.test(record.checksumSha256)) {
      throw invalidTimeline('A reviewed Timeline asset is unavailable in this Workspace.');
    }
  }
  const source = records.get(analysis.sourceAssetId)!;
  if (source.mediaKind !== 'video' || source.checksumSha256 !== analysis.sourceChecksum) throw invalidTimeline('The reviewed Timeline source has changed. Analyze and review it in Studio again.');
  for (const shot of analysis.shots) for (const frame of shot.frames) {
    if (!frame.assetId) continue;
    const record = records.get(frame.assetId)!;
    if (record.mediaKind !== 'image' || record.operation !== 'timeline_frame'
      || record.metadata?.sourceAssetId !== source.id || record.metadata?.sourceChecksumSha256 !== source.checksumSha256
      || record.metadata?.timelineTimeMs !== frame.timeMs) throw invalidTimeline('A selected Timeline still does not belong to the reviewed source and timestamp.');
  }
  return records;
}

const outputConfigSchema = z.object({
  outputPorts: z.array(z.enum(['frames', 'descriptions', 'videoResult'])).max(3).default([]),
  outputScope: z.enum(['selected', 'all']).default('selected'),
  activeShotIndex: z.number().int().min(0).max(99).default(0),
  clipAssetId: z.string().uuid().optional(),
});

export function resolveTimelinePublishedOutputs(analysis: TimelineAnalysis, config: Record<string, PipelineValue>) {
  const parsed = outputConfigSchema.safeParse(config);
  if (!parsed.success) throw invalidTimeline('Invalid Timeline output scope or selected shot.');
  const shots = getTimelineOutputShots(analysis, parsed.data.outputScope, parsed.data.activeShotIndex);
  if (parsed.data.outputPorts.includes('frames') && !timelineOutputFrameAssetIds(shots).length) {
    throw invalidTimeline('Prepare all selected Timeline frames before publication.');
  }
  if (parsed.data.outputPorts.includes('videoResult') && parsed.data.outputScope === 'selected' && !parsed.data.clipAssetId) {
    throw invalidTimeline('Prepare the selected Timeline video fragment before publication.');
  }
  return { ...parsed.data, shots };
}

export async function validateTimelineOutputAssets(analysis: TimelineAnalysis, config: Record<string, PipelineValue>, workspaceId: string, read: TimelineAssetReader = readTimelineAssets) {
  const output = resolveTimelinePublishedOutputs(analysis, config);
  const records = await validateTimelineAssets(analysis, workspaceId, read);
  if (output.outputScope === 'selected' && output.outputPorts.includes('videoResult')) {
    const clip = (await read(workspaceId, [output.clipAssetId!])).find((record) => record.id === output.clipAssetId);
    const range = videoTrimRangeSchema.safeParse(clip?.metadata?.range).data;
    const shot = output.shots[0]!;
    if (!clip || clip.workspaceId !== workspaceId || clip.status !== 'ready' || clip.mediaKind !== 'video'
      || !/^[a-f0-9]{64}$/i.test(clip.checksumSha256) || clip.operation !== 'video_trim'
      || clip.metadata?.sourceAssetId !== analysis.sourceAssetId || clip.metadata?.sourceChecksumSha256 !== analysis.sourceChecksum
      || range?.startMs !== shot.startMs || range?.endMs !== shot.endMs) {
      throw invalidTimeline('The selected Timeline video fragment does not match its reviewed source and range.');
    }
    records.set(clip.id, clip);
  }
  return { records, output };
}

/** Called before the publication checksum: pins are generated by the server, not Studio settings. */
export async function pinTimelinePublicationAssets(plan: CompiledPipelinePlan, workspaceId: string, read: TimelineAssetReader = readTimelineAssets): Promise<CompiledPipelinePlan> {
  const pinned = structuredClone(plan);
  for (const node of pinned.definition.nodes) {
    if (node.handlerType !== 'timeline.handoff') continue;
    const parsed = timelineAnalysisSchema.safeParse(node.config.analysis);
    if (!parsed.success || new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > 1_000_000) throw invalidTimeline('Timeline Handoff requires a valid reviewed snapshot within 1 MB.');
    const { records } = await validateTimelineOutputAssets(parsed.data, node.config, workspaceId, read);
    node.config.analysis = parsed.data as unknown as PipelineValue;
    node.config.assetChecksums = Object.fromEntries([...records].map(([id, record]) => [id, record.checksumSha256]));
  }
  return pinned;
}

function invalidTimeline(message: string) {
  return new PipelineDomainError({ code: 'pipeline_definition_invalid', message });
}
