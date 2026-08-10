import { getGenerationHistory } from './generation-history';
import type { GraphIoContext } from './graph-io-contracts';
import { getRouterIncomingSource, getSafeIndex, uniqueStrings } from './graph-io-sources';
import type {
  AdjustmentNodeData,
  BannerNodeData,
  CompositionNodeData,
  CropImageNodeData,
  CurvesNodeData,
  FrequencyRetouchNodeData,
  GenerateImageNodeData,
  ImportImageNodeData,
  IteratorNodeData,
  PreviewNodeData,
  ProductionNode,
  RefineImageNodeData,
  RemoveBackgroundNodeData,
  SketchNodeData,
} from './types';

export function getNodeImageAssetId(
  node?: ProductionNode,
  context?: GraphIoContext,
  visited = new Set<string>(),
): string | undefined {
  if (!node) return undefined;
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeImageAssetId(source.sourceNode, context, visited) : undefined;
  }
  if (node.type === 'importImage') return (node.data as ImportImageNodeData).assetId;
  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'image' ? data.activeImageAssetId : undefined;
  }
  if (node.type === 'generateImage') return getGenerationHistory(node.data as GenerateImageNodeData).activeAssetId;
  if (node.type === 'composition') return (node.data as CompositionNodeData).resultAssetId;
  if (node.type === 'sketch') return (node.data as SketchNodeData).assetId;
  if (node.type === 'cropImage') return (node.data as CropImageNodeData).resultAssetId;
  if (node.type === 'adjustment') {
    const data = node.data as AdjustmentNodeData;
    return data.resultAssetId ?? data.sourceAssetId;
  }
  if (node.type === 'curves') {
    const data = node.data as CurvesNodeData;
    return data.resultAssetId ?? data.sourceAssetId;
  }
  if (node.type === 'frequencyRetouch') {
    const data = node.data as FrequencyRetouchNodeData;
    return data.resultAssetId ?? data.sourceAssetId;
  }
  if (node.type === 'refineImage') return getGenerationHistory(node.data as RefineImageNodeData).activeAssetId;
  if (node.type === 'removeBackground') return (node.data as RemoveBackgroundNodeData).resultAssetId;
  if (node.type === 'preview') return (node.data as PreviewNodeData).assetId;
  if (node.type === 'banner') return (node.data as BannerNodeData).assetId;
  return undefined;
}

export function getNodeImageAssetIds(node?: ProductionNode) {
  if (!node) return [];
  const data = node.data as unknown as Record<string, unknown>;
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    const resultAssetIds = uniqueStrings([
      ...(Array.isArray(data.resultAssetIds)
        ? data.resultAssetIds.filter((item): item is string => typeof item === 'string')
        : []),
      typeof data.resultAssetId === 'string' ? data.resultAssetId : undefined,
    ]);
    if (resultAssetIds.length > 0) return resultAssetIds;
    return node.type === 'refineImage' && typeof data.sourceAssetId === 'string' ? [data.sourceAssetId] : [];
  }
  if (node.type === 'composition') {
    const assetId = (node.data as CompositionNodeData).resultAssetId;
    return assetId ? [assetId] : [];
  }
  if (node.type === 'subjectBuilder' || node.type === 'locationBuilder') {
    return Array.isArray(data.libraryImageAssetIds)
      ? data.libraryImageAssetIds.filter((item): item is string => typeof item === 'string')
      : [];
  }
  if (node.type === 'iterator') {
    const iterator = node.data as IteratorNodeData;
    return iterator.activeKind === 'image' && iterator.activeImageAssetId ? [iterator.activeImageAssetId] : [];
  }
  if (node.type === 'importImage' || node.type === 'sketch'
    || node.type === 'preview' || node.type === 'banner') {
    return typeof data.assetId === 'string' ? [data.assetId] : [];
  }
  return uniqueStrings([
    typeof data.resultAssetId === 'string' ? data.resultAssetId : undefined,
    typeof data.sourceAssetId === 'string' ? data.sourceAssetId : undefined,
  ]);
}

export function getNodeCurrentImageAssetId(node?: ProductionNode) {
  if (!node) return undefined;
  const data = node.data as unknown as Record<string, unknown>;
  if (typeof data.resultAssetId === 'string') return data.resultAssetId;
  if (typeof data.assetId === 'string') return data.assetId;
  const assetIds = getNodeImageAssetIds(node);
  const index = getSafeIndex(
    typeof data.activeResultIndex === 'number' ? data.activeResultIndex : undefined,
    assetIds.length,
  );
  return index >= 0 ? assetIds[index] : assetIds[0];
}

export function getNodeImageOutputAssetIds(
  node?: ProductionNode,
  context?: GraphIoContext,
  visited = new Set<string>(),
): string[] {
  if (!node) return [];
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeImageOutputAssetIds(source.sourceNode, context, visited) : [];
  }
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    const history = getGenerationHistory(node.data as GenerateImageNodeData);
    if (history.assetIds.length > 0) return history.assetIds;
    const sourceAssetId = (node.data as RefineImageNodeData).sourceAssetId;
    return node.type === 'refineImage' && sourceAssetId ? [sourceAssetId] : [];
  }
  if (node.type === 'composition') {
    const assetId = (node.data as CompositionNodeData).resultAssetId;
    return assetId ? [assetId] : [];
  }
  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'image' && data.activeImageAssetId ? [data.activeImageAssetId] : [];
  }
  if (node.type === 'importImage' || node.type === 'sketch'
    || node.type === 'preview' || node.type === 'banner') {
    const assetId = (node.data as ImportImageNodeData | SketchNodeData | PreviewNodeData | BannerNodeData).assetId;
    return assetId ? [assetId] : [];
  }
  return uniqueStrings([getNodeImageAssetId(node)]);
}
