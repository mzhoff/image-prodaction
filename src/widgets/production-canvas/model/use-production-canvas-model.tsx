'use client';

import { Copy, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { hasFileInDataTransfer, hasImageFileInDataTransfer, getImageFileFromDataTransfer } from '@/shared/lib/image-file';
import { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { createConnectMenuActions, getConnectCreateOptions } from '../lib/connect-create-menu';
import { useCanvasClipboard } from './use-canvas-clipboard';
import { useCanvasImageImport } from './use-canvas-image-import';
import { useCanvasToast } from './use-canvas-toast';
import { type ConnectionDropOnEmpty, useConnectionDraft } from './use-connection-draft';
import { useNodeDrag } from './use-node-drag';
import { usePortPointMeasurement } from './use-port-point-measurement';
import { addNodeMenu } from '../lib/add-node-menu';
import { useProductionCanvasStore } from './use-production-canvas-store';

export const CANVAS_WORLD_SIZE = 4000;

export function useProductionCanvasModel() {
  const canvas = useCanvasNavigation();
  const contextMenu = useContextMenu();
  const graph = useProductionCanvasStore();
  const [collapsedGenerateComposingNodeIds, setCollapsedGenerateComposingNodeIds] = useState<Set<string>>(() => new Set());
  const [pendingConnectionMenu, setPendingConnectionMenu] = useState<ConnectionDropOnEmpty | null>(null);
  const didInitialFitRef = useRef(false);
  const lastPointerWorldRef = useRef({ x: 0, y: 0 });
  const boxSelection = useCanvasBoxSelection({ screenToWorld: canvas.screenToWorld, onSelect: graph.selectNodesInRect });
  const measuredPortPoints = usePortPointMeasurement({
    collapsedGenerateComposingNodeIds,
    containerRef: canvas.containerRef,
    edges: graph.edges,
    nodes: graph.nodes,
    pan: canvas.pan,
    zoom: canvas.zoom,
  });

  useEffect(() => {
    if (didInitialFitRef.current || graph.nodes.length === 0) return;
    didInitialFitRef.current = true;
    window.requestAnimationFrame(() => canvas.zoomToBounds(graph.bounds, 64));
  }, [canvas, graph.bounds, graph.nodes.length]);

  const getFallbackPastePosition = useCallback(() => {
    const container = canvas.containerRef.current;
    if (!container) return lastPointerWorldRef.current;

    const rect = container.getBoundingClientRect();
    return canvas.screenToWorld({
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }) ?? lastPointerWorldRef.current;
  }, [canvas]);

  const importImageFile = useCanvasImageImport({ getFallbackPastePosition, pasteImageAsset: graph.pasteImageAsset });
  const { showToast, toastMessage } = useCanvasToast();
  useCanvasClipboard({
    deleteSelected: graph.deleteSelected,
    importImageFile,
    lastPointerWorldRef,
    pasteNodes: graph.pasteNodes,
    redo: graph.redo,
    undo: graph.undo,
  });

  const startNodeDrag = useNodeDrag({
    closeContextMenu: contextMenu.closeContextMenu,
    moveNode: graph.moveNode,
    moveSelectedNodesBy: graph.moveSelectedNodesBy,
    pushHistory: graph.pushHistory,
    screenToWorld: canvas.screenToWorld,
    selectNode: graph.selectNode,
    selectedSet: graph.selectedSet,
  });

  const createNode = useCallback((type: ProductionNodeType, position: { x: number; y: number }) => {
    const nodeId = graph.addNode(type, position);
    if (type === 'generateImage') {
      setCollapsedGenerateComposingNodeIds((current) => new Set(current).add(nodeId));
    }
    return nodeId;
  }, [graph]);

  const openConnectionCreateMenu = useCallback((drop: ConnectionDropOnEmpty) => {
    const source = graph.nodesById.get(drop.sourceNodeId);
    const sourcePort = source ? getPortById(source, drop.sourcePortId) : undefined;
    const options = sourcePort ? getConnectCreateOptions(sourcePort.kind) : [];
    if (!source || !sourcePort || options.length === 0) {
      setPendingConnectionMenu(null);
      return;
    }

    setPendingConnectionMenu(drop);
    contextMenu.openContextMenuAt(drop.screenPoint.x, drop.screenPoint.y, createConnectMenuActions(options, (option) => {
      const nodeId = createNode(option.type, drop.worldPoint);
      const result = graph.connect(drop.sourceNodeId, drop.sourcePortId, nodeId, option.targetPortId);
      if (!result.ok) showToast(result.reason);
      setPendingConnectionMenu(null);
    }));
  }, [contextMenu, createNode, graph, showToast]);

  const { clearConnectionDraft, connectionDraft, startConnection } = useConnectionDraft({
    connect: graph.connect,
    deleteEdge: graph.deleteEdge,
    edges: graph.edges,
    measuredPortPoints,
    nodesById: graph.nodesById,
    onConnectionError: showToast,
    onDropOnEmpty: openConnectionCreateMenu,
    screenToWorld: canvas.screenToWorld,
  });

  const closeContextMenu = useCallback(() => {
    if (pendingConnectionMenu) {
      clearConnectionDraft();
      setPendingConnectionMenu(null);
    }
    contextMenu.closeContextMenu();
  }, [clearConnectionDraft, contextMenu, pendingConnectionMenu]);

  const openCanvasMenu = useCallback((event: ReactMouseEvent) => {
    const worldPoint = canvas.screenToWorld(event.nativeEvent) ?? { x: 0, y: 0 };
    closeContextMenu();
    contextMenu.openContextMenu(event, [
      ...addNodeMenu.map((item) => ({
        id: `add-${item.type}`,
        label: item.label,
        icon: item.icon,
        onSelect: () => createNode(item.type, worldPoint),
      })),
      {
        id: 'zoom-to-fit',
        label: 'Zoom to fit',
        icon: <Maximize2 size={14} />,
        separatorBefore: true,
        onSelect: () => canvas.zoomToBounds(graph.bounds),
      },
      {
        id: 'reset-project',
        label: 'Reset local graph',
        icon: <RotateCcw size={14} />,
        separatorBefore: true,
        destructive: true,
        onSelect: graph.resetProject,
      },
    ]);
  }, [canvas, closeContextMenu, contextMenu, createNode, graph]);

  const openNodeMenu = useCallback((node: ProductionNode, event: ReactMouseEvent) => {
    graph.selectNode(node.id);
    closeContextMenu();
    contextMenu.openContextMenu(event, [
      { id: 'copy-node', label: 'Duplicate node', icon: <Copy size={14} />, disabled: true, onSelect: () => undefined },
      {
        id: 'delete-node',
        label: 'Delete selected',
        icon: <Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        onSelect: graph.deleteSelected,
      },
    ]);
  }, [closeContextMenu, contextMenu, graph]);

  const handleCanvasMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-node-id]') || target.closest('button')) return;
    closeContextMenu();
    boxSelection.startSelection(event);
  };

  const handleCanvasMouseMove = (event: ReactMouseEvent) => {
    const worldPoint = canvas.screenToWorld(event.nativeEvent);
    if (worldPoint) lastPointerWorldRef.current = worldPoint;
  };

  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasImageFileInDataTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFileInDataTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();

    const imageFile = getImageFileFromDataTransfer(event.dataTransfer, 'dropped-image');
    if (!imageFile) return;
    closeContextMenu();

    const dropPoint = canvas.screenToWorld(event.nativeEvent) ?? getFallbackPastePosition();
    void importImageFile(imageFile, dropPoint);
  };

  const toggleGenerateComposing = useCallback((nodeId: string, open: boolean) => {
    setCollapsedGenerateComposingNodeIds((current) => {
      const next = new Set(current);
      if (open) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const cursor = canvas.isPanning ? 'grabbing' : boxSelection.isSelecting ? 'crosshair' : undefined;

  return {
    bounds: graph.bounds,
    boxSelection,
    canvas,
    closeContextMenu,
    collapsedGenerateComposingNodeIds,
    connectionDraft,
    contextMenu,
    cursor,
    edges: graph.edges,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    historyFutureLength: graph.historyFutureLength,
    historyPastLength: graph.historyPastLength,
    measuredPortPoints,
    nodes: graph.nodes,
    nodesById: graph.nodesById,
    openCanvasMenu,
    openNodeMenu,
    redo: graph.redo,
    deleteSelected: graph.deleteSelected,
    selectedSet: graph.selectedSet,
    startConnection,
    startNodeDrag,
    toastMessage,
    toggleGenerateComposing,
    undo: graph.undo,
  };
}
