import type { CompositionNodeData } from '@/entities/production-graph/model/types';
import type { CompositionLayerGroupView } from './composition-model-types';

interface CompositionSelectionActionsParams {
  connectedLayerIds: string[];
  groups: CompositionLayerGroupView[];
  nodeId: string;
  selectedLayerIds: string[];
  updateNodeDataSilent: (nodeId: string, data: Partial<CompositionNodeData>) => void;
}

export function createCompositionSelectionActions({
  connectedLayerIds,
  groups,
  nodeId,
  selectedLayerIds,
  updateNodeDataSilent,
}: CompositionSelectionActionsParams) {
  const selectLayer = (layerId: string, additive = false) => {
    if (!connectedLayerIds.includes(layerId)) return;
    const nextLayerIds = additive
      ? selectedLayerIds.includes(layerId)
        ? selectedLayerIds.filter((id) => id !== layerId)
        : [...selectedLayerIds, layerId]
      : [layerId];
    const fallbackLayerIds = nextLayerIds.length > 0 ? nextLayerIds : [layerId];
    updateNodeDataSilent(nodeId, {
      selectedGroupId: undefined,
      selectedLayerId: fallbackLayerIds[0],
      selectedLayerIds: fallbackLayerIds,
    });
  };

  const selectLayerRange = (layerId: string) => {
    if (!connectedLayerIds.includes(layerId)) return;
    const anchorLayerId = selectedLayerIds[0] && connectedLayerIds.includes(selectedLayerIds[0])
      ? selectedLayerIds[0]
      : connectedLayerIds[0];
    const anchorIndex = connectedLayerIds.indexOf(anchorLayerId);
    const targetIndex = connectedLayerIds.indexOf(layerId);
    if (anchorIndex < 0 || targetIndex < 0) {
      selectLayer(layerId);
      return;
    }
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    const nextLayerIds = connectedLayerIds.slice(start, end + 1);
    updateNodeDataSilent(nodeId, {
      selectedGroupId: undefined,
      selectedLayerId: nextLayerIds[0],
      selectedLayerIds: nextLayerIds,
    });
  };

  const selectGroup = (groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    updateNodeDataSilent(nodeId, {
      selectedGroupId: group.id,
      selectedLayerId: group.layerIds[0],
      selectedLayerIds: group.layerIds,
    });
  };

  const clearSelection = () => {
    updateNodeDataSilent(nodeId, {
      selectedGroupId: undefined,
      selectedLayerId: undefined,
      selectedLayerIds: [],
    });
  };

  return { clearSelection, selectGroup, selectLayer, selectLayerRange };
}
