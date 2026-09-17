import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { getTimelineOutputShots, timelineOutputFrameAssetIds, timelineOutputDescriptions } from '@/shared/media/timeline-output';
import { createTimelinePublicResult, type TimelinePublicResult } from '@/shared/media/timeline-public-contract';
import type { GraphIoContext } from './graph-io-contracts';
import { getNodeTimelineAnalysis } from './graph-video-io';
export { getNodeTimelineAnalysis } from './graph-video-io';
import type { ProductionNode, TimelineHandoffNodeData } from './types';

const publicResults = new WeakMap<TimelineAnalysis, TimelinePublicResult>();

export function getNodeTimelineResult(node?: ProductionNode, context?: Pick<GraphIoContext, 'nodes' | 'edges'>) {
  const analysis = getNodeTimelineAnalysis(node, context);
  if (!analysis) return undefined;
  if (!publicResults.has(analysis)) publicResults.set(analysis, createTimelinePublicResult(analysis));
  return publicResults.get(analysis);
}

export const getNodeTimelinePublicResult = getNodeTimelineResult;

export function getNodeTimelineOutputShots(node?: ProductionNode, context?: Pick<GraphIoContext, 'nodes' | 'edges'>) {
  const analysis = getNodeTimelineAnalysis(node, context);
  if (!analysis || !node) return [];
  const data = node.data as TimelineHandoffNodeData;
  return getTimelineOutputShots(analysis, data.outputScope, data.activeShotIndex);
}

export function getNodeTimelineFrameAssetIds(node?: ProductionNode, context?: Pick<GraphIoContext, 'nodes' | 'edges'>) {
  return timelineOutputFrameAssetIds(getNodeTimelineOutputShots(node, context));
}

export function getNodeTimelineDescriptions(node?: ProductionNode, context?: Pick<GraphIoContext, 'nodes' | 'edges'>) {
  return timelineOutputDescriptions(getNodeTimelineOutputShots(node, context));
}
