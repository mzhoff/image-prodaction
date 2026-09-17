import { z } from 'zod';
import { videoRequestSchema, videoSettingsSchema } from '@/shared/media/video-generation-contracts';
import { videoNodeDefinitions } from './node-registry-video';
import { normalizeNodeSize } from './node-layout';
import type { GenerateVideoNodeData, ProductionNode } from './types';

const requestSchema = z.object({ jobId: z.string().uuid().optional(), idempotencyKey: z.string().min(1).max(200),
  workspaceId: z.string().uuid(), documentId: z.string().uuid(), payload: videoRequestSchema }).strict();
export function normalizeVideoNode(node: ProductionNode): ProductionNode | null {
  if (node.type !== 'generateVideo') return null;
  const data = node.data as GenerateVideoNodeData;
  const defaults = videoNodeDefinitions.generateVideo.createData();
  const settings = videoSettingsSchema.safeParse({ ...defaults, ...data }).data ?? defaults;
  const resultAssetIds = z.array(z.string().uuid()).max(200).safeParse(data.resultAssetIds).data ?? [];
  return { ...node, size: normalizeNodeSize(node.type, node.size), data: { ...defaults, ...data, ...settings,
    resultAssetIds, activeResultIndex: Math.max(0, Math.min(resultAssetIds.length - 1, Number.isInteger(data.activeResultIndex) ? data.activeResultIndex : 0)),
    referenceDescriptions: Array.from({ length: 3 }, (_, index) => typeof data.referenceDescriptions?.[index] === 'string' ? data.referenceDescriptions[index].slice(0, 2000) : ''),
    videoRequest: requestSchema.safeParse(data.videoRequest).data,
  } };
}
