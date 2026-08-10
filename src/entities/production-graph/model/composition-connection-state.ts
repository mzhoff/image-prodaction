import type { CompositionNodeData, ProductionNode, ProductionNodeData } from './types';

export function invalidateCompositionResult(
  nodes: ProductionNode[],
  nodeId: string,
  options: { clearLayerContent?: boolean; targetPortId?: string } = {},
) {
  return nodes.map((node) => {
    if (node.id !== nodeId || node.type !== 'composition') return node;
    const data = node.data as CompositionNodeData;
    const layers = options.clearLayerContent && options.targetPortId
      ? data.layers?.map((layer) => layer.id === options.targetPortId
        ? { ...layer, assetId: undefined, text: undefined }
        : layer)
      : data.layers;
    return {
      ...node,
      data: {
        ...data,
        layers,
        resultAssetId: undefined,
        resultSignature: undefined,
      } as ProductionNodeData,
    };
  });
}

export function preserveCompositionLayerIdentityOnReconnect(
  nodes: ProductionNode[],
  params: { fromPortId?: string; nodeId: string; toPortId: string },
) {
  if (!params.fromPortId || params.fromPortId === params.toPortId) return nodes;
  return nodes.map((node) => {
    if (node.id !== params.nodeId || node.type !== 'composition') return node;
    const data = node.data as CompositionNodeData;
    const swapLayerId = (layerId: string) => {
      if (layerId === params.fromPortId) return params.toPortId;
      if (layerId === params.toPortId) return params.fromPortId;
      return layerId;
    };
    return {
      ...node,
      data: {
        ...data,
        groups: data.groups?.map((group) => ({
          ...group,
          itemIds: group.itemIds?.map(swapLayerId),
          layerIds: group.layerIds.map(swapLayerId),
        })),
        layerOrder: data.layerOrder?.map(swapLayerId),
        layers: data.layers?.map((layer) => ({ ...layer, id: swapLayerId(layer.id) })),
        selectedLayerId: data.selectedLayerId ? swapLayerId(data.selectedLayerId) : undefined,
        selectedLayerIds: data.selectedLayerIds?.map(swapLayerId),
      } as ProductionNodeData,
    };
  });
}

export function isCompositionLayerIdentityReconnect(
  nodes: ProductionNode[],
  params: { fromNodeId?: string; fromPortId?: string; nodeId: string; toPortId: string },
) {
  if (!params.fromPortId || params.fromPortId === params.toPortId || params.fromNodeId !== params.nodeId) return false;
  return nodes.some((node) => node.id === params.nodeId && node.type === 'composition');
}
