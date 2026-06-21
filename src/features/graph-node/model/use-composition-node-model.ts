'use client';

import { getCompositionLayerInputCount } from '@/entities/production-graph/model/node-definitions';
import type { CompositionLayerStyle, CompositionNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { composeCompositionResult } from './composition-compose-action';
import { createCompositionGroupActions } from './composition-group-actions';
import { getAlignedLayerPatch, normalizeCanvasDimension, upsertLayerStyle, upsertLayerStyles } from './composition-layer-style';
import { isLayerLocked, isLayerVisible } from './composition-layer-tree-model';
import type { CompositionLayerView, CompositionLayerTreeDragItem, CompositionLayerTreeDropTarget } from './composition-model-types';
import { getCompositionCanvasSize, compositionAspectRatioOptions, compositionBlendModeOptions, compositionFitOptions, compositionFontOptions, compositionSizeOptions, compositionWeightOptions } from './composition-options';
import { createCompositionSelectionActions } from './composition-selection-actions';
import { useCompositionDerivedState } from './use-composition-derived-state';
export { compositionAspectRatioOptions, compositionBlendModeOptions, compositionFitOptions, compositionFontOptions, compositionSizeOptions, compositionWeightOptions } from './composition-options';
export { getDefaultTextLineHeight } from './composition-layer-style';
export type { CompositionLayerGroupView, CompositionLayerTreeDragItem, CompositionLayerTreeDropTarget, CompositionLayerTreeItem, CompositionLayerView } from './composition-model-types';

export function useCompositionNodeModel(node: ProductionNode) {
  const data = node.data as CompositionNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const renameNode = useProductionGraphStore((state) => state.renameNode);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const layerCount = getCompositionLayerInputCount(node);
  const canvasWidth = normalizeCanvasDimension(data.canvasWidth, 1080);
  const canvasHeight = normalizeCanvasDimension(data.canvasHeight, 1080);
  const selectedSize = compositionSizeOptions.some((option) => option.value === data.size) ? data.size ?? '1K' : '1K';

  const {
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
  } = useCompositionDerivedState({
    assets,
    canvasHeight,
    canvasWidth,
    data,
    edges,
    layerCount,
    node,
    nodes,
  });

  const setCanvasSize = (width: number, height: number, aspectRatio = data.aspectRatio, size = selectedSize) => {
    updateNodeData(node.id, {
      aspectRatio,
      canvasWidth: normalizeCanvasDimension(width, canvasWidth),
      canvasHeight: normalizeCanvasDimension(height, canvasHeight),
      size,
    });
  };

  const handleAspectRatioChange = (aspectRatio: string) => {
    if (aspectRatio === 'custom') {
      updateNodeData(node.id, { aspectRatio });
      return;
    }
    const nextSize = getCompositionCanvasSize(aspectRatio, selectedSize, canvasWidth / Math.max(1, canvasHeight));
    setCanvasSize(nextSize.width, nextSize.height, aspectRatio);
  };

  const handleSizeChange = (size: string) => {
    const nextSize = getCompositionCanvasSize(data.aspectRatio, size, canvasWidth / Math.max(1, canvasHeight));
    setCanvasSize(nextSize.width, nextSize.height, data.aspectRatio, size);
  };

  const updateCanvasSizeSilent = (width: number, height: number, aspectRatio = data.aspectRatio) => {
    updateNodeDataSilent(node.id, {
      aspectRatio,
      canvasWidth: normalizeCanvasDimension(width, canvasWidth),
      canvasHeight: normalizeCanvasDimension(height, canvasHeight),
      size: 'custom',
    });
  };

  const commitCanvasSize = () => {
    updateNodeData(node.id, {
      aspectRatio: data.aspectRatio,
      canvasWidth,
      canvasHeight,
      size: selectedSize,
    });
  };

  const updateLayer = (layerId: string, patch: Partial<CompositionLayerStyle>) => {
    updateNodeData(node.id, {
      layers: upsertLayerStyle(data.layers, layerId, patch),
      selectedLayerId: layerId,
      selectedLayerIds: [layerId],
      selectedGroupId: undefined,
    });
  };

  const updateLayerSilent = (layerId: string, patch: Partial<CompositionLayerStyle>) => {
    updateNodeDataSilent(node.id, {
      layers: upsertLayerStyle(data.layers, layerId, patch),
      selectedLayerId: layerId,
      selectedLayerIds: [layerId],
      selectedGroupId: undefined,
    });
  };

  const updateLayersSilent = (patches: Array<{ layerId: string; patch: Partial<CompositionLayerStyle> }>) => {
    if (patches.length === 0) return;
    updateNodeDataSilent(node.id, {
      layers: upsertLayerStyles(data.layers, patches),
    });
  };

  const commitLayerSnapshot = (layerId: string) => {
    const layer = layers.find((item) => item.id === layerId);
    updateLayer(layerId, layer ? layer.style : {});
  };

  const commitLayerSnapshots = (layerIds: string[]) => {
    updateNodeData(node.id, {
      layers: upsertLayerStyles(data.layers, layerIds.flatMap((layerId) => {
        const layer = layers.find((item) => item.id === layerId);
        return layer ? [{ layerId, patch: layer.style }] : [];
      })),
      selectedGroupId: selectedGroup?.id,
      selectedLayerId: layerIds[0],
      selectedLayerIds: layerIds,
    });
  };

  const alignLayerToCanvas = (layerId: string, alignment: CompositionAlignment) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    updateLayer(layerId, getAlignedLayerPatch(layer, { x: 0, y: 0, width: canvasWidth, height: canvasHeight }, alignment));
  };

  const alignLayerToNeighbor = (layerId: string, alignment: CompositionAlignment) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    const target = connectedLayers.find((item) => item.id !== layerId);
    if (!target) return;
    updateLayer(layerId, getAlignedLayerPatch(layer, target.style, alignment));
  };

  const handleAddLayer = () => {
    updateNodeData(node.id, { layerInputCount: Math.min(12, layerCount + 1) });
  };

  const { clearSelection, selectGroup, selectLayer, selectLayerRange } = createCompositionSelectionActions({
    connectedLayerIds,
    groups,
    nodeId: node.id,
    selectedLayerIds,
    updateNodeDataSilent,
  });

  const toggleLayerLock = (layerId: string) => {
    const layer = layers.find((item) => item.id === layerId);
    updateLayer(layerId, { locked: !(layer?.style.locked ?? false) });
  };

  const toggleLayerVisibility = (layerId: string) => {
    const layer = layers.find((item) => item.id === layerId);
    updateLayer(layerId, { visible: !(layer?.style.visible ?? true) });
  };

  const renameLayer = (layerId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    if (layer.sourceNodeId) {
      updateNodeDataSilent(node.id, {
        layers: upsertLayerStyle(data.layers, layerId, { name: undefined }),
      });
      renameNode(layer.sourceNodeId, trimmedName);
      return;
    }
    updateLayer(layerId, { name: trimmedName });
  };

  const detachLayerSource = (layerId: string) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer?.sourceEdge) return;
    updateNodeDataSilent(node.id, {
      layers: upsertLayerStyle(data.layers, layerId, {
        assetId: layer.kind === 'image' ? layer.assetId : undefined,
        kind: layer.kind,
        name: layer.name,
        text: layer.kind === 'text' ? layer.text : undefined,
      }),
      selectedGroupId: undefined,
      selectedLayerId: layerId,
      selectedLayerIds: [layerId],
    });
    deleteEdge(layer.sourceEdge.id, {
      preserveCompositionLayerContent: true,
      preserveDynamicInputSlots: true,
    });
  };

  const {
    expandGroup,
    groupSelectedLayers,
    moveLayerTreeItem,
    renameGroup,
    toggleGroupCollapse,
    toggleGroupLock,
    toggleGroupVisibility,
  } = createCompositionGroupActions({
    connectedLayers,
    data,
    groups,
    nodeId: node.id,
    selectedLayerIds,
    updateNodeData,
  });

  const handleCompose = (options: { silent?: boolean } = {}) => composeCompositionResult({
    addAsset,
    canvasHeight,
    canvasWidth,
    currentResultSignature,
    nodeId: node.id,
    setNodeStatus,
    updateNodeData,
    updateNodeDataSilent,
    visibleConnectedLayers,
  }, options);

  return {
    canvasHeight,
    canvasWidth,
    clearSelection,
    connectedLayers,
    data,
    getLayerGroup: (layerId: string) => groups.find((group) => group.descendantLayerIds.includes(layerId)),
    groupSelectedLayers,
    groups,
    handleAddLayer,
    handleAspectRatioChange,
    handleCanvasHeightChange: (height: number) => setCanvasSize(canvasWidth, height, 'custom'),
    handleCanvasWidthChange: (width: number) => setCanvasSize(width, canvasHeight, 'custom'),
    commitCanvasSize,
    handleSizeChange,
    handleCompose,
    layerCount,
    layerTreeItems,
    layers,
    resultAssetId: currentResultAssetId,
    resultSignature: currentResultSignature,
    resultStale: data.resultSignature !== currentResultSignature || !data.resultAssetId,
    selectedSize,
    selectedGroup,
    selectedLayer,
    selectedLayerId,
    selectedLayerIds,
    selectedLayers,
    sizeOptions: compositionSizeOptions,
    alignLayerToCanvas,
    alignLayerToNeighbor,
    commitLayerSnapshot,
    commitLayerSnapshots,
    isLayerLocked: (layer: CompositionLayerView) => isLayerLocked(layer, groupStateByLayerId.get(layer.id)),
    isLayerVisible: (layer: CompositionLayerView) => isLayerVisible(layer, groupStateByLayerId.get(layer.id)),
    moveLayerTreeItem,
    detachLayerSource,
    renameGroup,
    renameLayer,
    selectGroup,
    selectLayer,
    selectLayerRange,
    toggleGroupLock,
    toggleGroupCollapse,
    toggleGroupVisibility,
    expandGroup,
    toggleLayerLock,
    toggleLayerVisibility,
    updateLayer,
    updateCanvasSizeSilent,
    updateLayersSilent,
    updateLayerSilent,
    visibleConnectedLayers,
  };
}

export type CompositionAlignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
