import type { CompositionLayerStyle, CompositionNodeData } from '@/entities/production-graph/model/types';
import { insertGroupIntoLayerOrder, moveCompositionLayerTreeItem, serializeCompositionGroups } from './composition-layer-tree-model';
import type { CompositionLayerGroupView, CompositionLayerTreeDragItem, CompositionLayerTreeDropTarget, CompositionLayerView } from './composition-model-types';

interface CompositionGroupActionsParams {
  connectedLayers: CompositionLayerView[];
  data: CompositionNodeData;
  groups: CompositionLayerGroupView[];
  nodeId: string;
  selectedLayerIds: string[];
  updateNodeData: (nodeId: string, data: Partial<CompositionNodeData>) => void;
}

export function createCompositionGroupActions({
  connectedLayers,
  data,
  groups,
  nodeId,
  selectedLayerIds,
  updateNodeData,
}: CompositionGroupActionsParams) {
  const toggleGroupLock = (groupId: string) => {
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups(groups.map((group) => (group.id === groupId ? { ...group, locked: !(group.locked ?? false) } : group))),
    });
  };

  const toggleGroupVisibility = (groupId: string) => {
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups(groups.map((group) => (group.id === groupId ? { ...group, visible: !(group.visible ?? true) } : group))),
    });
  };

  const toggleGroupCollapse = (groupId: string) => {
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups(groups.map((group) => (group.id === groupId ? { ...group, collapsed: !(group.collapsed ?? false) } : group))),
    });
  };

  const expandGroup = (groupId: string) => {
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups(groups.map((group) => (group.id === groupId ? { ...group, collapsed: false } : group))),
    });
  };

  const renameGroup = (groupId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups(groups.map((group) => (group.id === groupId ? { ...group, name: trimmedName } : group))),
    });
  };

  const groupSelectedLayers = () => {
    if (selectedLayerIds.length < 2) return;
    const groupedLayerIds = new Set(selectedLayerIds);
    const nextGroups = groups
      .map((group) => {
        const layerIds = group.layerIds.filter((layerId) => !groupedLayerIds.has(layerId));
        const itemIds = group.itemIds?.filter((itemId) => !groupedLayerIds.has(itemId));
        return { ...group, itemIds, layerIds };
      })
      .filter((group) => group.layerIds.length > 0 || group.groupIds?.length);
    const groupId = `group-${Date.now()}`;
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups([
        ...nextGroups,
        {
          collapsed: false,
          id: groupId,
          itemIds: selectedLayerIds,
          layerIds: selectedLayerIds,
          name: `Group ${nextGroups.length + 1}`,
          visible: true,
        },
      ]),
      layerOrder: insertGroupIntoLayerOrder(data.layerOrder, groups, connectedLayers, selectedLayerIds, groupId),
      selectedGroupId: groupId,
      selectedLayerId: selectedLayerIds[0],
      selectedLayerIds,
    });
  };

  const moveLayerTreeItem = (dragItem: CompositionLayerTreeDragItem, dropTarget: CompositionLayerTreeDropTarget) => {
    const next = moveCompositionLayerTreeItem({
      connectedLayers,
      dragItem,
      dropTarget,
      groups,
      layerOrder: data.layerOrder,
    });
    if (!next) return;
    updateNodeData(nodeId, {
      groups: serializeCompositionGroups(next.groups),
      layerOrder: next.layerOrder,
      selectedGroupId: dragItem.kind === 'group' ? dragItem.id : undefined,
      selectedLayerId: dragItem.kind === 'layer' ? dragItem.id : undefined,
      selectedLayerIds: dragItem.kind === 'layer' ? [dragItem.id] : groups.find((group) => group.id === dragItem.id)?.descendantLayerIds ?? [],
    });
  };

  return {
    expandGroup,
    groupSelectedLayers,
    moveLayerTreeItem,
    renameGroup,
    toggleGroupCollapse,
    toggleGroupLock,
    toggleGroupVisibility,
  };
}
