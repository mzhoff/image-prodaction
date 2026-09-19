import { mergeExtractNodeSettings } from './pipeline-extract-settings';
import { imageGenerationOptionsSchema } from '@/shared/media/image-generation-settings';
import type { ImageToTextNodeData, ProductionNode, ProductionNodeData } from '@/entities/production-graph/model/types';

/** A format-only edit must not keep a rectangle derived for the previous format.
 * Apply this after patch transport as well: JSON does not preserve undefined fields. */
export function mergePipelineNodeSettings(node: ProductionNode, settings: Record<string, unknown>): ProductionNodeData {
  if (node.type === 'imageToText') return mergeExtractNodeSettings(node.data as ImageToTextNodeData, settings);
  const data = { ...node.data, ...settings } as Record<string, unknown>;
  if (node.type === 'generateImage' && typeof settings.model === 'string'
    && settings.model !== (node.data as { model: string }).model) {
    for (const field of Object.keys(imageGenerationOptionsSchema.shape)) {
      if (!Object.hasOwn(settings, field)) delete data[field];
    }
  }
  if (node.type === 'cropImage') {
    const previous = node.data as { aspectRatio?: string; crop?: unknown };
    const ratioChanged = typeof settings.aspectRatio === 'string' && settings.aspectRatio !== previous.aspectRatio;
    const cropChanged = Object.hasOwn(settings, 'crop') && JSON.stringify(settings.crop) !== JSON.stringify(previous.crop);
    if (ratioChanged || cropChanged) {
      for (const key of ['resultAssetId', 'videoResultAssetId', 'videoResultSignature']) delete data[key];
    }
    if (ratioChanged && !Object.hasOwn(settings, 'crop')) {
      for (const key of ['crop', 'sourceAssetId', 'sourceAspectRatio', 'cropStateVersion']) delete data[key];
    }
  }
  return data as unknown as ProductionNodeData;
}

