import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { FAVORITE_NODE_DRAG_MIME_TYPE, NODE_DRAG_MIME_TYPE } from '../lib/node-drag';

export type CanvasTool = 'select' | 'section';

export function getDraggedNodeType(dataTransfer: DataTransfer) {
  const value = dataTransfer.getData(NODE_DRAG_MIME_TYPE);
  return value ? value as ProductionNodeType : null;
}

export function hasDraggedNodeType(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(NODE_DRAG_MIME_TYPE);
}

export function getDraggedFavoriteNodeId(dataTransfer: DataTransfer) {
  return dataTransfer.getData(FAVORITE_NODE_DRAG_MIME_TYPE) || null;
}

export function hasDraggedFavoriteNode(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(FAVORITE_NODE_DRAG_MIME_TYPE);
}

export function hasClearableGenerationData(node: ProductionNode) {
  const data = node.data as unknown as Record<string, unknown>;
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    return Boolean(data.resultAssetId)
      || (Array.isArray(data.resultAssetIds) && data.resultAssetIds.length > 0);
  }
  if (node.type === 'textGeneration') {
    return Boolean(data.result)
      || (Array.isArray(data.resultTexts) && data.resultTexts.length > 0);
  }
  if (node.type === 'subjectBuilder' || node.type === 'locationBuilder') {
    return Array.isArray(data.libraryImageAssetIds) && data.libraryImageAssetIds.length > 0;
  }
  return Boolean(data.resultAssetId);
}
