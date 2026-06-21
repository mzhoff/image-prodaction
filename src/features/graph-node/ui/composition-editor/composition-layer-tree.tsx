'use client';

import { Folder, ImageIcon, Type } from 'lucide-react';
import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { CompositionLayerTreeDragItem, CompositionLayerTreeDropTarget, CompositionLayerTreeItem, CompositionLayerView } from '../../model/use-composition-node-model';
import type { CompositionModel } from './composition-types';
import { CompositionConfirmDialog } from './composition-confirm-dialog';
import { CompositionLayerTreeRow } from './composition-layer-tree-row';

export function CompositionLayerTree({
  model,
  onHoverLayer,
}: {
  model: CompositionModel;
  onHoverLayer: (layerId: string | undefined) => void;
}) {
  const [dragItem, setDragItem] = useState<CompositionLayerTreeDragItem | undefined>();
  const [dropTarget, setDropTarget] = useState<CompositionLayerTreeDropTarget | undefined>();
  const [detachLayer, setDetachLayer] = useState<CompositionLayerView | undefined>();
  const expandTimerRef = useRef<{ groupId: string; timer: number } | undefined>(undefined);

  useEffect(() => () => clearGroupExpandTimer(expandTimerRef), []);

  const handleDragItem = (item: CompositionLayerTreeDragItem | undefined) => {
    setDragItem(item);
    if (item) return;
    clearGroupExpandTimer(expandTimerRef);
    setDropTarget(undefined);
  };

  const markDropTarget = (event: ReactDragEvent<HTMLElement>, target: CompositionLayerTreeDropTarget) => {
    if (!dragItem) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  };

  const scheduleGroupExpand = (groupId: string, collapsed: boolean) => {
    if (!dragItem || !collapsed) {
      clearGroupExpandTimer(expandTimerRef);
      return;
    }
    if (expandTimerRef.current?.groupId === groupId) return;
    clearGroupExpandTimer(expandTimerRef);
    expandTimerRef.current = {
      groupId,
      timer: window.setTimeout(() => {
        model.expandGroup(groupId);
        expandTimerRef.current = undefined;
      }, 1000),
    };
  };

  const dropTreeItem = (event: ReactDragEvent<HTMLElement>, target: CompositionLayerTreeDropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragItem) return;
    clearGroupExpandTimer(expandTimerRef);
    model.moveLayerTreeItem(dragItem, target);
    setDragItem(undefined);
    setDropTarget(undefined);
  };

  const markDropNearTreeItem = (
    event: ReactDragEvent<HTMLElement>,
    target: { id: string; parentGroupId?: string },
  ) => {
    clearGroupExpandTimer(expandTimerRef);
    const rect = event.currentTarget.getBoundingClientRect();
    markDropTarget(event, {
      ...target,
      position: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before',
    });
  };
  const dropNearTreeItem = (
    event: ReactDragEvent<HTMLElement>,
    target: { id: string; parentGroupId?: string },
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dropTreeItem(event, {
      ...target,
      position: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before',
    });
  };

  const markDropOnGroup = (event: ReactDragEvent<HTMLElement>, group: CompositionLayerTreeItem & { kind: 'group' }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
    const target = ratio < 0.25
      ? { id: group.id, parentGroupId: group.group.parentGroupId, position: 'before' as const }
      : ratio > 0.75
        ? { id: group.id, parentGroupId: group.group.parentGroupId, position: 'after' as const }
        : { id: group.id, position: 'inside' as const };
    markDropTarget(event, target);
    scheduleGroupExpand(group.id, Boolean(group.group.collapsed) && target.position === 'inside');
  };
  const dropOnGroup = (event: ReactDragEvent<HTMLElement>, group: CompositionLayerTreeItem & { kind: 'group' }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (ratio < 0.25) {
      dropTreeItem(event, { id: group.id, parentGroupId: group.group.parentGroupId, position: 'before' });
      return;
    }
    if (ratio > 0.75) {
      dropTreeItem(event, { id: group.id, parentGroupId: group.group.parentGroupId, position: 'after' });
      return;
    }
    dropTreeItem(event, { id: group.id, position: 'inside' });
  };

  const getDropIndicator = (id: string, parentGroupId?: string) => {
    if (dropTarget?.id !== id) return undefined;
    if (dropTarget.position === 'inside') return 'inside';
    if ((dropTarget.parentGroupId ?? '') !== (parentGroupId ?? '')) return undefined;
    return dropTarget.position;
  };

  const renderTreeItem = (item: CompositionLayerTreeItem, parentGroupId?: string): ReactNode => {
    if (item.kind === 'layer') {
      const layer = item.layer;
      return (
        <CompositionLayerTreeRow
          key={layer.id}
          active={model.selectedLayerIds.includes(layer.id)}
          dragItem={{ id: layer.id, kind: 'layer' }}
          dropIndicator={getDropIndicator(layer.id, parentGroupId)}
          hidden={!model.isLayerVisible(layer)}
          icon={layer.kind === 'image' ? <ImageIcon size={13} /> : <Type size={13} />}
          label={layer.name}
          linkedSource={Boolean(layer.sourceEdge)}
          locked={model.isLayerLocked(layer)}
          onClick={(event) => {
            if (event.shiftKey) model.selectLayerRange(layer.id);
            else model.selectLayer(layer.id, event.metaKey || event.ctrlKey);
          }}
          onDetachSource={() => setDetachLayer(layer)}
          onDragItem={handleDragItem}
          onDragOver={(event) => markDropNearTreeItem(event, { id: layer.id, parentGroupId })}
          onDrop={(event) => dropNearTreeItem(event, { id: layer.id, parentGroupId })}
          onHoverChange={(hovered) => onHoverLayer(hovered ? layer.id : undefined)}
          onRename={(name) => model.renameLayer(layer.id, name)}
          onToggleLock={() => model.toggleLayerLock(layer.id)}
          onToggleVisibility={() => model.toggleLayerVisibility(layer.id)}
        />
      );
    }

    const group = item.group;
    const childItems = (group.itemIds ?? []).flatMap((itemId): CompositionLayerTreeItem[] => {
      const childGroup = group.childGroups.find((child) => child.id === itemId);
      if (childGroup) return [{ id: childGroup.id, kind: 'group', group: childGroup }];
      const layer = group.layers.find((child) => child.id === itemId);
      return layer ? [{ id: layer.id, kind: 'layer', layer }] : [];
    });
    const groupInsideActive = dropTarget?.id === group.id && dropTarget.position === 'inside';

    return (
      <div key={group.id} className="composition-layer-group">
        <CompositionLayerTreeRow
          active={model.selectedGroup?.id === group.id}
          collapsed={Boolean(group.collapsed)}
          dragItem={{ id: group.id, kind: 'group' }}
          dropIndicator={getDropIndicator(group.id, group.parentGroupId)}
          expandable
          hidden={group.visible === false}
          icon={<Folder size={13} />}
          label={group.name}
          locked={Boolean(group.locked)}
          onClick={() => model.selectGroup(group.id)}
          onDragItem={handleDragItem}
          onDragOver={(event) => markDropOnGroup(event, item)}
          onDrop={(event) => dropOnGroup(event, item)}
          onRename={(name) => model.renameGroup(group.id, name)}
          onToggleCollapse={() => model.toggleGroupCollapse(group.id)}
          onToggleLock={() => model.toggleGroupLock(group.id)}
          onToggleVisibility={() => model.toggleGroupVisibility(group.id)}
        />
        {!group.collapsed ? (
          <div
            className={[
              'composition-layer-children',
              groupInsideActive ? 'composition-layer-children-drop-inside' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={(event) => {
              markDropTarget(event, { id: group.id, position: 'inside' });
            }}
            onDrop={(event) => dropTreeItem(event, { id: group.id, position: 'inside' })}
          >
            {childItems.map((childItem) => renderTreeItem(childItem, group.id))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="composition-layer-list composition-layer-list-fullscreen"
      onDragOver={(event) => {
        if (!dragItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        clearGroupExpandTimer(expandTimerRef);
        setDropTarget(undefined);
      }}
      onDrop={(event) => dropTreeItem(event, { position: 'after' })}
    >
      <strong>Layers</strong>
      {model.layerTreeItems.map((item) => renderTreeItem(item))}
      {detachLayer ? (
        <CompositionConfirmDialog
          title="Разорвать связь"
          message={`Слой "${detachLayer.name}" станет локальным в композиции. Текущий контент останется, но будущие изменения исходной ноды больше не будут сюда попадать.`}
          confirmLabel="Разорвать"
          onCancel={() => setDetachLayer(undefined)}
          onConfirm={() => {
            model.detachLayerSource(detachLayer.id);
            setDetachLayer(undefined);
          }}
        />
      ) : null}
    </div>
  );
}


function clearGroupExpandTimer(ref: { current: { groupId: string; timer: number } | undefined }) {
  if (ref.current) window.clearTimeout(ref.current.timer);
  ref.current = undefined;
}
