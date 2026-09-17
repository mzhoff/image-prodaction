import { timelineOutputFrameAssetIds, timelineOutputDescriptions } from '@/shared/media/timeline-output';
import { timelineAnalysisSchema } from '@/shared/media/timeline-contracts';
import { createTimelinePublicResult, type TimelinePublicAsset } from '@/shared/media/timeline-public-contract';
import type { PipelineNodeHandler, PipelineValue } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-value-validation';
import { validateTimelineOutputAssets, type TimelineAssetReader, type TimelineStoredAsset } from './pipeline-timeline-assets';

/** No detection, image extraction or model calls: execute only the reviewed immutable snapshot. */
export function createTimelineHandoffHandler(readAssets?: TimelineAssetReader): PipelineNodeHandler {
  return { handlerType: 'timeline.handoff', handlerVersion: '1', async execute(input) {
    input.signal.throwIfAborted();
    const parsed = timelineAnalysisSchema.safeParse(input.config.analysis);
    const video = input.inputs.video;
    if (!parsed.success || new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > 1_000_000 || Object.keys(input.inputs).length !== 1
      || !video || !isPipelineArtifactReference(video, 'video')) throw invalid(input.nodeId, 'Timeline Handoff needs a reviewed snapshot and one video input.');
    const analysis = parsed.data;
    if (video.assetId !== analysis.sourceAssetId || video.checksumSha256 !== analysis.sourceChecksum) {
      throw invalid(input.nodeId, 'The input video does not match the reviewed Timeline. Analyze and review the new video in Studio first.');
    }
    const pins = input.config.assetChecksums;
    if (!pins || typeof pins !== 'object' || Array.isArray(pins)) throw invalid(input.nodeId, 'Timeline assets were not pinned at publication. Republish from Studio.');
    const { records, output: selected } = await validateTimelineOutputAssets(analysis, input.config, input.context.workspaceId, readAssets);
    for (const id of records.keys()) if (pins[id] !== records.get(id)!.checksumSha256) {
      throw invalid(input.nodeId, 'A pinned Timeline asset no longer matches its published checksum.');
    }
    input.signal.throwIfAborted();
    const output = createTimelinePublicResult(analysis);
    output.source = artifact(records.get(analysis.sourceAssetId)!, input.context.runId);
    output.frames = output.frames.map((frame) => ({ ...frame,
      ...(frame.asset ? { asset: artifact(records.get(frame.asset.assetId)!, input.context.runId) } : {}),
    }));
    const result: Record<string, PipelineValue> = { timeline: output as unknown as PipelineValue };
    if (selected.outputPorts.includes('frames')) result.frames = timelineOutputFrameAssetIds(selected.shots)
      .map((id) => artifact(records.get(id)!, input.context.runId)) as unknown as PipelineValue;
    if (selected.outputPorts.includes('descriptions')) result.descriptions = timelineOutputDescriptions(selected.shots);
    if (selected.outputPorts.includes('videoResult')) result.videoResult = artifact(records.get(
      selected.outputScope === 'all' ? analysis.sourceAssetId : selected.clipAssetId!,
    )!, input.context.runId) as unknown as PipelineValue;
    return result;
  } };
}

function artifact(record: TimelineStoredAsset, runId: string): TimelinePublicAsset {
  return { kind: record.mediaKind === 'video' ? 'video' : 'image', assetId: record.id,
    mimeType: record.contentType, sizeBytes: record.byteSize, checksumSha256: record.checksumSha256,
    contentUrl: `/v1/runs/${runId}/artifacts/${record.id}`,
  };
}
function invalid(nodeId: string, message: string) { return new PipelineNodeHandlerError({ nodeId, message }); }
