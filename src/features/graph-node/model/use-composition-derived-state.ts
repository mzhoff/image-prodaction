'use client';

import { useMemo } from 'react';
import { getIncomingImageInputs, getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { getCompositionLayerPortId } from '@/entities/production-graph/model/node-definitions';
import type { AssetRecord, CompositionLayerKind, CompositionNodeData, GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { collectLayerTreeStates, flattenLayerTreeItems, getCompositionLayerTreeItems, isLayerVisible, normalizeCompositionGroups } from './composition-layer-tree-model';
import { normalizeLayerStyle } from './composition-layer-style';
import type { CompositionLayerTreeState, CompositionLayerView } from './composition-model-types';
import { getCompositionResultSignature } from './composition-signature';

export function useCompositionDerivedState({
  assets,
  canvasHeight,
  canvasWidth,
  data,
  edges,
  layerCount,
  node,
  nodes,
}: {
  assets: AssetRecord[];
  canvasHeight: number;
  canvasWidth: number;
  data: CompositionNodeData;
  edges: GraphEdge[];
  layerCount: number;
  node: ProductionNode;
  nodes: ProductionNode[];
}) {
    const layers = useMemo(() => (
      Array.from({ length: layerCount }, (_, index) => {
        const portId = getCompositionLayerPortId(index);
        const image = getIncomingImageInputs(node.id, portId, { assets, edges, nodes })[0];
        const text = getIncomingTextInputs(node.id, portId, { edges, nodes })[0];
        const saved = data.layers?.find((layer) => layer.id === portId);
        const localAsset = saved?.assetId ? assets.find((asset) => asset.id === saved.assetId) : undefined;
        const kind: CompositionLayerKind = image || localAsset ? 'image' : 'text';
        const name = saved?.name || image?.sourceLabel || text?.sourceLabel || `Layer ${index + 1}`;
        return {
          asset: image?.asset ?? localAsset,
          assetId: image?.assetId ?? saved?.assetId,
          id: portId,
          index,
          kind,
          name,
          portId,
          sourceEdge: image?.edge ?? text?.edge,
          sourceLabel: image?.sourceLabel ?? text?.sourceLabel,
          sourceNodeId: image?.sourceNode.id ?? text?.sourceNode.id,
          style: normalizeLayerStyle(saved, { canvasHeight, canvasWidth, index, kind }),
          text: text?.text ?? saved?.text,
        } satisfies CompositionLayerView;
      })
    ), [assets, canvasHeight, canvasWidth, data.layers, edges, layerCount, node.id, nodes]);

    const groups = useMemo(() => normalizeCompositionGroups(data.groups, layers), [data.groups, layers]);
    const groupStateByLayerId = useMemo(() => {
      const next = new Map<string, CompositionLayerTreeState>();
      for (const group of groups.filter((item) => !item.parentGroupId)) {
        collectLayerTreeStates(group, { locked: false, visible: true }, next);
      }
      return next;
    }, [groups]);

    const connectedLayers = layers.filter((layer) => layer.assetId || layer.text?.trim());
    const connectedLayerIds = connectedLayers.map((layer) => layer.id);
    const layerTreeItems = useMemo(() => getCompositionLayerTreeItems(data.layerOrder, groups, connectedLayers), [connectedLayers, data.layerOrder, groups]);
    const treeOrderedConnectedLayers = useMemo(() => flattenLayerTreeItems(layerTreeItems), [layerTreeItems]);
    const visibleConnectedLayers = [...treeOrderedConnectedLayers]
      .reverse()
      .filter((layer) => isLayerVisible(layer, groupStateByLayerId.get(layer.id)));
    const currentResultSignature = useMemo(() => (
      getCompositionResultSignature({
        canvasHeight,
        canvasWidth,
        layers: visibleConnectedLayers,
      })
    ), [canvasHeight, canvasWidth, visibleConnectedLayers]);
    const currentResultAssetId = data.resultAssetId && data.resultSignature === currentResultSignature ? data.resultAssetId : undefined;
    const selectedGroup = data.selectedGroupId ? groups.find((group) => group.id === data.selectedGroupId) : undefined;
    const rawSelectedLayerIds = selectedGroup
      ? selectedGroup.descendantLayerIds
      : data.selectedLayerIds?.length
        ? data.selectedLayerIds
        : data.selectedLayerId
          ? [data.selectedLayerId]
          : [];
    const selectedLayerIds = rawSelectedLayerIds.filter((layerId, index, list) => (
      connectedLayerIds.includes(layerId) && list.indexOf(layerId) === index
    ));
    const selectedLayerId = selectedLayerIds[0];
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);
    const selectedLayers = layers.filter((layer) => selectedLayerIds.includes(layer.id));

  return {
    connectedLayerIds,
    connectedLayers,
    currentResultAssetId,
    currentResultSignature,
    groupStateByLayerId,
    groups,
    layerTreeItems,
    layers,
    selectedGroup,
    selectedLayer,
    selectedLayerId,
    selectedLayerIds,
    selectedLayers,
    visibleConnectedLayers,
  };
}
