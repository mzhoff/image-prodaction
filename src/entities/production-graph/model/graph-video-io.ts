import { getTimelineOutputShots, timelineClipSignature } from '@/shared/media/timeline-output';
import { timelineAnalysisSchema, type TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { getCropVideoSignature } from './crop-video-result';
import type { GraphIoContext } from './graph-io-contracts';
import { getIncomingSources, getRouterIncomingSource } from './graph-io-sources';
import { getPortById } from './node-definitions';
import type { CropImageNodeData, GenerateVideoNodeData, ImportImageNodeData, ProductionNode, TimelineHandoffNodeData } from './types';

export function getImportVideoPreviewAssetId(data: ImportImageNodeData, selectedAudioTrackIndex?: number): string | undefined {
  return data.mediaKind === 'video' && data.assetId && data.videoDerivedSourceAssetId === data.assetId
    && data.videoPreviewAudioTrackIndex === selectedAudioTrackIndex ? data.videoPreviewAssetId : undefined;
}

export function getNodeVideoAssetId(
  node?: ProductionNode,
  sourcePortId = 'original',
  context?: Pick<GraphIoContext, 'nodes' | 'edges'>,
  visited = new Set<string>(),
): string | undefined {
  if (!node) return undefined;
  if (node.type === 'generateVideo' && sourcePortId === 'video') {
    const data = node.data as GenerateVideoNodeData;
    return data.resultAssetIds[data.activeResultIndex] ?? data.resultAssetIds.at(-1);
  }
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeVideoAssetId(source.sourceNode, source.sourcePortId, context, visited) : undefined;
  }
  if (node.type === 'timelineHandoff') {
    if (sourcePortId !== 'videoResult' || !context) return undefined;
    const analysis = getNodeTimelineAnalysis(node, context, visited);
    if (!analysis) return undefined;
    const data = node.data as TimelineHandoffNodeData;
    if (data.outputScope === 'all') return analysis.sourceAssetId;
    const shot = getTimelineOutputShots(analysis, 'selected', data.activeShotIndex)[0];
    return shot && data.videoResultSignature === timelineClipSignature(analysis, shot) ? data.videoResultAssetId : undefined;
  }
  if (node.type === 'cropImage') {
    if (sourcePortId !== 'videoResult' || !context || visited.has(node.id)) return undefined;
    visited.add(node.id);
    const data = node.data as CropImageNodeData;
    if (!data.videoResultAssetId || !data.videoResultSignature) return undefined;
    const inputs = context.edges.filter((edge) => edge.targetNodeId === node.id
      && (edge.targetPortId === 'image' || edge.targetPortId === 'video'));
    // Old/imported graphs may contain both inputs. Never silently choose one of them.
    if (inputs.length !== 1 || inputs[0]!.targetPortId !== 'video') return undefined;
    const input = inputs[0]!;
    const source = context.nodes.find((candidate) => candidate.id === input.sourceNodeId);
    if (!source || (source.type !== 'router' && getPortById(source, input.sourcePortId)?.kind !== 'video')) return undefined;
    const sourceAssetId = getNodeVideoAssetId(source, input.sourcePortId, context, visited);
    const signature = sourceAssetId ? getCropVideoSignature(sourceAssetId, data.crop) : undefined;
    return signature && signature === data.videoResultSignature ? data.videoResultAssetId : undefined;
  }
  if (node.type !== 'importImage') return undefined;
  const data = node.data as ImportImageNodeData;
  if (data.mediaKind !== 'video') return undefined;
  if (sourcePortId === 'original') return data.assetId;
  return sourcePortId === 'video' && data.assetId && data.videoDerivedSourceAssetId === data.assetId
    ? data.videoOnlyAssetId : undefined;
}

export function getFirstIncomingVideoAsset(targetNodeId: string, portId: string, context: GraphIoContext) {
  for (const source of getIncomingSources(targetNodeId, portId, context)) {
    if (source.sourceNode.type !== 'router' && getPortById(source.sourceNode, source.sourcePortId)?.kind !== 'video') continue;
    const assetId = getNodeVideoAssetId(source.sourceNode, source.sourcePortId, context);
    const asset = context.assets.find((candidate) => candidate.id === assetId && candidate.kind === 'video');
    if (asset) return asset;
  }
  return undefined;
}

// Graph snapshots are immutable; reuse parsed Timeline data during recursive source resolution.
const validatedResults = new WeakMap<object, TimelineAnalysis | undefined>();

/** Full ordered document, never the current preview shot. Old video results fail closed. */
export function getNodeTimelineAnalysis(node?: ProductionNode, context?: Pick<GraphIoContext, 'nodes' | 'edges'>, visited = new Set<string>()): TimelineAnalysis | undefined {
  if (node?.type !== 'timelineHandoff' || visited.has(node.id)) return undefined;
  visited.add(node.id);
  const analysis = (node.data as TimelineHandoffNodeData).analysis;
  if (!analysis || typeof analysis !== 'object') return undefined;
  if (!validatedResults.has(analysis)) validatedResults.set(analysis, timelineAnalysisSchema.safeParse(analysis).data);
  const result = validatedResults.get(analysis);
  if (!result) return undefined;
  if (context) {
    const sources = getIncomingSources(node.id, 'video', context);
    const source = sources.length === 1 ? sources[0] : undefined;
    if (!source || getNodeVideoAssetId(source.sourceNode, source.sourcePortId, context, visited) !== result.sourceAssetId) return undefined;
  }
  return result;
}

