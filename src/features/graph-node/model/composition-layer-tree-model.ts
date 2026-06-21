import type { CompositionLayerGroup } from '@/entities/production-graph/model/types';
import type { CompositionLayerGroupView, CompositionLayerTreeDragItem, CompositionLayerTreeDropTarget, CompositionLayerTreeItem, CompositionLayerTreeState, CompositionLayerView } from './composition-model-types';

export function normalizeCompositionGroups(groups: CompositionLayerGroup[] | undefined, layers: CompositionLayerView[]): CompositionLayerGroupView[] {
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const validLayerIds = new Set(layerById.keys());
  const usedGroupIds = new Set<string>();
  const baseGroups = (groups ?? []).flatMap((group): Array<CompositionLayerGroup & { parentGroupId?: string }> => {
    if (!group.id || usedGroupIds.has(group.id)) return [];
    usedGroupIds.add(group.id);
    return [{ ...group, groupIds: group.groupIds ?? [], itemIds: group.itemIds ?? [] }];
  });
  const baseGroupById = new Map(baseGroups.map((group) => [group.id, group]));
  const usedLayerIds = new Set<string>();
  const usedChildGroupIds = new Set<string>();
  const normalizedBaseGroups = baseGroups.map((group) => {
    const layerIds = group.layerIds.filter((layerId) => {
      if (!validLayerIds.has(layerId) || usedLayerIds.has(layerId)) return false;
      usedLayerIds.add(layerId);
      return true;
    });
    const groupIds = (group.groupIds ?? []).filter((groupId) => {
      if (groupId === group.id || !baseGroupById.has(groupId) || usedChildGroupIds.has(groupId)) return false;
      usedChildGroupIds.add(groupId);
      return true;
    });
    const validItemIds = new Set([...groupIds, ...layerIds]);
    const usedItemIds = new Set<string>();
    const itemIds = (group.itemIds ?? []).filter((itemId) => {
      if (!validItemIds.has(itemId) || usedItemIds.has(itemId)) return false;
      usedItemIds.add(itemId);
      return true;
    });
    for (const id of [...groupIds, ...layerIds]) {
      if (!usedItemIds.has(id)) itemIds.push(id);
    }
    return { ...group, groupIds, itemIds, layerIds };
  }).filter((group) => group.layerIds.length > 0 || group.groupIds.length > 0);
  const parentByGroupId = new Map<string, string>();
  for (const group of normalizedBaseGroups) {
    for (const groupId of group.groupIds ?? []) parentByGroupId.set(groupId, group.id);
  }
  const normalizedGroupById = new Map(normalizedBaseGroups.map((group) => [group.id, group]));
  const buildGroup = (groupId: string, stack: Set<string>): CompositionLayerGroupView | undefined => {
    const group = normalizedGroupById.get(groupId);
    if (!group || stack.has(groupId)) return undefined;
    const nextStack = new Set(stack).add(groupId);
    const childGroups = (group.itemIds ?? []).flatMap((itemId): CompositionLayerGroupView[] => {
      if (!group.groupIds?.includes(itemId)) return [];
      const childGroup = buildGroup(itemId, nextStack);
      return childGroup ? [childGroup] : [];
    });
    const directLayers = (group.itemIds ?? []).flatMap((itemId): CompositionLayerView[] => {
      if (!group.layerIds.includes(itemId)) return [];
      const layer = layerById.get(itemId);
      return layer ? [layer] : [];
    });
    return {
      ...group,
      childGroups,
      descendantLayerIds: [
        ...directLayers.map((layer) => layer.id),
        ...childGroups.flatMap((childGroup) => childGroup.descendantLayerIds),
      ],
      layers: directLayers,
      name: group.name || 'Group',
      parentGroupId: parentByGroupId.get(group.id),
    };
  };
  return normalizedBaseGroups.flatMap((group): CompositionLayerGroupView[] => {
    const view = buildGroup(group.id, new Set());
    return view ? [view] : [];
  });
}

export function serializeCompositionGroups(groups: CompositionLayerGroup[]): CompositionLayerGroup[] {
  return groups.map((group) => {
    const { childGroups: _childGroups, descendantLayerIds: _descendantLayerIds, layers: _layers, parentGroupId: _parentGroupId, ...data } = group as CompositionLayerGroup & Partial<CompositionLayerGroupView>;
    return data;
  });
}

export function getCompositionLayerTreeItems(
  layerOrder: string[] | undefined,
  groups: CompositionLayerGroupView[],
  connectedLayers: CompositionLayerView[],
): CompositionLayerTreeItem[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const nestedGroupIds = new Set(groups.flatMap((group) => group.groupIds ?? []));
  const groupedLayerIds = new Set(groups.flatMap((group) => group.layerIds));
  const rootLayers = connectedLayers.filter((layer) => !groupedLayerIds.has(layer.id));
  const rootLayerById = new Map(rootLayers.map((layer) => [layer.id, layer]));
  const rootGroups = groups.filter((group) => !nestedGroupIds.has(group.id));
  const defaultOrder = [...rootGroups.map((group) => group.id), ...rootLayers.map((layer) => layer.id)];
  const orderedIds = normalizeOrder(layerOrder, defaultOrder);

  return orderedIds.flatMap((id): CompositionLayerTreeItem[] => {
    const group = groupById.get(id);
    if (group && !nestedGroupIds.has(group.id)) return [{ id: group.id, kind: 'group', group }];
    const layer = rootLayerById.get(id);
    return layer ? [{ id: layer.id, kind: 'layer', layer }] : [];
  });
}

export function flattenLayerTreeItems(items: CompositionLayerTreeItem[]): CompositionLayerView[] {
  return items.flatMap((item) => (item.kind === 'group' ? flattenGroupLayers(item.group) : [item.layer]));
}

function flattenGroupLayers(group: CompositionLayerGroupView): CompositionLayerView[] {
  return (group.itemIds ?? []).flatMap((itemId): CompositionLayerView[] => {
    const childGroup = group.childGroups.find((item) => item.id === itemId);
    if (childGroup) return flattenGroupLayers(childGroup);
    const layer = group.layers.find((item) => item.id === itemId);
    return layer ? [layer] : [];
  });
}

export function collectLayerTreeStates(
  group: CompositionLayerGroupView,
  inherited: CompositionLayerTreeState,
  output: Map<string, CompositionLayerTreeState>,
) {
  const state = {
    locked: inherited.locked || Boolean(group.locked),
    visible: inherited.visible && group.visible !== false,
  };
  for (const layerId of group.layerIds) output.set(layerId, state);
  for (const childGroup of group.childGroups) collectLayerTreeStates(childGroup, state, output);
}

function normalizeOrder(order: string[] | undefined, defaultOrder: string[]) {
  const validIds = new Set(defaultOrder);
  const usedIds = new Set<string>();
  const ordered = (order ?? []).flatMap((id): string[] => {
    if (!validIds.has(id) || usedIds.has(id)) return [];
    usedIds.add(id);
    return [id];
  });
  for (const id of defaultOrder) {
    if (!usedIds.has(id)) ordered.push(id);
  }
  return ordered;
}

function getRootOrder(layerOrder: string[] | undefined, groups: CompositionLayerGroupView[], connectedLayers: CompositionLayerView[]) {
  const nestedGroupIds = new Set(groups.flatMap((group) => group.groupIds ?? []));
  const groupedLayerIds = new Set(groups.flatMap((group) => group.layerIds));
  const rootGroupIds = groups.filter((group) => !nestedGroupIds.has(group.id)).map((group) => group.id);
  const rootLayerIds = connectedLayers.filter((layer) => !groupedLayerIds.has(layer.id)).map((layer) => layer.id);
  return normalizeOrder(layerOrder, [...rootGroupIds, ...rootLayerIds]);
}

export function insertGroupIntoLayerOrder(
  layerOrder: string[] | undefined,
  groups: CompositionLayerGroupView[],
  connectedLayers: CompositionLayerView[],
  layerIds: string[],
  groupId: string,
) {
  const selectedLayerIds = new Set(layerIds);
  const rootOrder = getRootOrder(layerOrder, groups, connectedLayers);
  const firstSelectedIndex = rootOrder.findIndex((id) => selectedLayerIds.has(id));
  const next = rootOrder.filter((id) => !selectedLayerIds.has(id));
  next.splice(firstSelectedIndex >= 0 ? firstSelectedIndex : next.length, 0, groupId);
  return next;
}

export function moveCompositionLayerTreeItem({
  connectedLayers,
  dragItem,
  dropTarget,
  groups,
  layerOrder,
}: {
  connectedLayers: CompositionLayerView[];
  dragItem: CompositionLayerTreeDragItem;
  dropTarget: CompositionLayerTreeDropTarget;
  groups: CompositionLayerGroupView[];
  layerOrder: string[] | undefined;
}): { groups: CompositionLayerGroupView[]; layerOrder: string[] } | undefined {
  if (dragItem.id === dropTarget.id) return undefined;
  if (dragItem.kind === 'group' && dropTarget.parentGroupId && isGroupDescendant(dropTarget.parentGroupId, dragItem.id, groups)) return undefined;
  if (dragItem.kind === 'group' && dropTarget.position === 'inside' && dropTarget.id && isGroupDescendant(dropTarget.id, dragItem.id, groups)) return undefined;

  let nextGroups: CompositionLayerGroupView[] = groups.map((group) => ({
    ...group,
    groupIds: (group.groupIds ?? []).filter((groupId) => !(dragItem.kind === 'group' && groupId === dragItem.id)),
    itemIds: (group.itemIds ?? []).filter((itemId) => itemId !== dragItem.id),
    layerIds: group.layerIds.filter((layerId) => !(dragItem.kind === 'layer' && layerId === dragItem.id)),
  }));
  let rootOrder = getRootOrder(layerOrder, groups, connectedLayers).filter((id) => id !== dragItem.id);

  if (dropTarget.position === 'inside' && dropTarget.id) {
    nextGroups = insertItemIntoGroup(nextGroups, dragItem, dropTarget.id, undefined, 'before');
    return { groups: nextGroups, layerOrder: rootOrder };
  }

  if (dropTarget.parentGroupId) {
    nextGroups = insertItemIntoGroup(nextGroups, dragItem, dropTarget.parentGroupId, dropTarget.id, dropTarget.position);
    return { groups: nextGroups, layerOrder: rootOrder };
  }

  rootOrder = dropTarget.id
    ? insertIdNear(rootOrder, dragItem.id, dropTarget.id, dropTarget.position)
    : [...rootOrder, dragItem.id];
  return { groups: nextGroups, layerOrder: rootOrder };
}

function insertItemIntoGroup(
  groups: CompositionLayerGroupView[],
  dragItem: CompositionLayerTreeDragItem,
  groupId: string,
  targetId: string | undefined,
  position: 'after' | 'before' | 'inside',
): CompositionLayerGroupView[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    const groupIds = dragItem.kind === 'group' && !group.groupIds?.includes(dragItem.id)
      ? [...(group.groupIds ?? []), dragItem.id]
      : group.groupIds ?? [];
    const layerIds = dragItem.kind === 'layer' && !group.layerIds.includes(dragItem.id)
      ? [...group.layerIds, dragItem.id]
      : group.layerIds;
    const itemIds = targetId
      ? insertIdNear(group.itemIds ?? [], dragItem.id, targetId, position)
      : [dragItem.id, ...(group.itemIds ?? []).filter((itemId) => itemId !== dragItem.id)];
    return { ...group, collapsed: false, groupIds, itemIds, layerIds };
  });
}

function isGroupDescendant(groupId: string, possibleAncestorId: string, groups: CompositionLayerGroupView[]): boolean {
  const group = groups.find((item) => item.id === possibleAncestorId);
  if (!group) return false;
  if (group.groupIds?.includes(groupId)) return true;
  return (group.groupIds ?? []).some((childGroupId) => isGroupDescendant(groupId, childGroupId, groups));
}

function insertIdNear(ids: string[], id: string, targetId: string | undefined, position: 'after' | 'before' | 'inside') {
  const next = ids.filter((item) => item !== id);
  if (!targetId) return [...next, id];
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) return [...next, id];
  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, id);
  return next;
}

export function isLayerLocked(layer: CompositionLayerView, group?: CompositionLayerTreeState) {
  return layer.style.locked || Boolean(group?.locked);
}

export function isLayerVisible(layer: CompositionLayerView, group?: CompositionLayerTreeState) {
  return layer.style.visible !== false && group?.visible !== false;
}
