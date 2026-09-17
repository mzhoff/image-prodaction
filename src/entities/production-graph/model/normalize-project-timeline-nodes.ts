import { z } from 'zod';
import { DEFAULT_TIMELINE_MODEL, isTimelineModel } from '@/shared/api/timeline-models';
import { MAX_TIMELINE_DESCRIPTION_CHARACTERS, timelineAnalysisSchema } from '@/shared/media/timeline-contracts';
import { normalizeNodeSize } from './node-layout';
import type { ProductionNode, TimelineHandoffNodeData } from './types';

const requestSchema = z.object({
  jobId: z.string().uuid().optional(), idempotencyKey: z.string().min(1).max(200),
  fingerprint: z.string().min(1).max(250_000), action: z.enum(['analyze', 'describe']),
  sourceAssetId: z.string().uuid(), workspaceId: z.string().uuid(), documentId: z.string().uuid(),
  shotBaselines: z.array(z.object({
    id: z.string().min(1).max(80), description: z.string().max(MAX_TIMELINE_DESCRIPTION_CHARACTERS * 2), fingerprint: z.string().max(512),
  }).strict()).max(100).optional(),
}).strict();

export function normalizeTimelineNode(node: ProductionNode): ProductionNode | null {
  if (node.type !== 'timelineHandoff') return null;
  const data = node.data as TimelineHandoffNodeData;
  const analysis = timelineAnalysisSchema.safeParse(data.analysis).data;
  const index = typeof data.activeShotIndex === 'number' && Number.isFinite(data.activeShotIndex) ? Math.floor(data.activeShotIndex) : 0;
  return { ...node, size: normalizeNodeSize(node.type, node.size), data: {
    ...data, title: data.title || 'Timeline Handoff', analysis,
    model: typeof data.model === 'string' && isTimelineModel(data.model) ? data.model : DEFAULT_TIMELINE_MODEL,
    language: typeof data.language === 'string' && data.language.trim() && data.language !== 'system' ? data.language.slice(0, 80) : undefined,
    threshold: typeof data.threshold === 'number' && Number.isFinite(data.threshold) ? Math.min(60, Math.max(1, data.threshold)) : 10,
    activeShotIndex: Math.min(Math.max(0, index), Math.max(0, (analysis?.shots.length ?? 1) - 1)),
    outputScope: data.outputScope === 'all' ? 'all' : 'selected',
    videoResultAssetId: typeof data.videoResultAssetId === 'string' ? data.videoResultAssetId : undefined,
    videoResultSignature: typeof data.videoResultSignature === 'string' ? data.videoResultSignature : undefined,
    previewMode: data.previewMode === 'image' ? 'image' : 'video',
    request: requestSchema.safeParse(data.request).data,
  } };
}
