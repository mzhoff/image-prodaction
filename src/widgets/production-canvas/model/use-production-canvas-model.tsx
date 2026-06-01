'use client';

import { Copy, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { getPortById } from '@/entities/production-graph/model/node-definitions';
import { DEFAULT_PROJECT_VIEWPORT } from '@/entities/production-graph/model/project-schema';
import type { PortableProjectExport } from '@/entities/production-graph/model/project-schema';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { hasFileInDataTransfer, hasImageFileInDataTransfer, getImageFileFromDataTransfer } from '@/shared/lib/image-file';
import { createDatedJsonFileName, downloadJsonFile, readJsonFile } from '@/shared/lib/json-file';
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
import { useSectionDrag } from './use-section-drag';
import { useSectionDrawing } from './use-section-drawing';
import { useSectionResize } from './use-section-resize';
import { addNodeMenu } from '../lib/add-node-menu';
import { useProductionCanvasStore } from './use-production-canvas-store';

export const CANVAS_WORLD_SIZE = 4000;
type CanvasTool = 'select' | 'section';

export function useProductionCanvasModel() {
  const contextMenu = useContextMenu();
  const graph = useProductionCanvasStore();
  const canvas = useCanvasNavigation({
    initialPan: { x: graph.uiState.viewport.x, y: graph.uiState.viewport.y },
    initialZoom: graph.uiState.viewport.zoom,
  });
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [pendingConnectionMenu, setPendingConnectionMenu] = useState<ConnectionDropOnEmpty | null>(null);
  const didInitialFitRef = useRef(false);
  const didApplyRestoredViewportRef = useRef(false);
  const lastPointerWorldRef = useRef({ x: 0, y: 0 });
  const hasRestoredViewport = graph.uiState.viewport.x !== DEFAULT_PROJECT_VIEWPORT.x
    || graph.uiState.viewport.y !== DEFAULT_PROJECT_VIEWPORT.y
    || graph.uiState.viewport.zoom !== DEFAULT_PROJECT_VIEWPORT.zoom;
  const collapsedGenerateComposingNodeIds = useMemo(() => new Set(
    graph.nodes
      .filter((node) => node.type === 'generateImage' && graph.uiState.nodes[node.id]?.collapsed)
      .map((node) => node.id),
  ), [graph.nodes, graph.uiState.nodes]);
  const boxSelection = useCanvasBoxSelection({ screenToWorld: canvas.screenToWorld, onSelect: graph.selectNodesInRect });
  const finishSectionDrawing = useCallback(() => setCanvasTool('select'), []);
  const sectionDrawing = useSectionDrawing({
    screenToWorld: canvas.screenToWorld,
    onCreateSection: graph.addSection,
    onFinish: finishSectionDrawing,
  });
  const measuredPortPoints = usePortPointMeasurement({
    collapsedGenerateComposingNodeIds,
    containerRef: canvas.containerRef,
    edges: graph.edges,
    nodes: graph.nodes,
    pan: canvas.pan,
    zoom: canvas.zoom,
  });

  useEffect(() => {
    if (!hasRestoredViewport || didApplyRestoredViewportRef.current) return;
    didApplyRestoredViewportRef.current = true;
    canvas.setPan({ x: graph.uiState.viewport.x, y: graph.uiState.viewport.y });
    canvas.setZoom(graph.uiState.viewport.zoom);
  }, [canvas, graph.uiState.viewport.x, graph.uiState.viewport.y, graph.uiState.viewport.zoom, hasRestoredViewport]);

  useEffect(() => {
    if (hasRestoredViewport || didInitialFitRef.current || graph.nodes.length === 0) return;
    didInitialFitRef.current = true;
    window.requestAnimationFrame(() => canvas.zoomToBounds(graph.bounds, 64));
  }, [canvas, graph.bounds, graph.nodes.length, hasRestoredViewport]);

  useEffect(() => {
    const viewport = { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom };
    const timeoutId = window.setTimeout(() => graph.setProjectUiViewport(viewport), 150);
    return () => window.clearTimeout(timeoutId);
  }, [canvas.pan.x, canvas.pan.y, canvas.zoom, graph.setProjectUiViewport]);

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
  const exportProjectSnapshot = useCallback(() => {
    downloadJsonFile(graph.exportProjectSnapshot(), createDatedJsonFileName('reverie-project'));
    showToast('Project snapshot exported.');
  }, [graph, showToast]);
  const exportPipelineTemplate = useCallback(() => {
    downloadJsonFile(graph.exportPipelineTemplate(), createDatedJsonFileName('reverie-pipeline-template'));
    showToast('Pipeline template exported.');
  }, [graph, showToast]);
  const importPortableProjectFile = useCallback(async (file: File, expectedKind: PortableProjectExport['kind']) => {
    try {
      const result = graph.importPortableProject(await readJsonFile(file), expectedKind);
      showToast(result.kind === 'pipelineTemplate' ? 'Pipeline template imported.' : 'Project snapshot imported.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось импортировать JSON.');
    }
  }, [graph, showToast]);
  const importProjectSnapshotFile = useCallback((file: File) => {
    void importPortableProjectFile(file, 'projectSnapshot');
  }, [importPortableProjectFile]);
  const importPipelineTemplateFile = useCallback((file: File) => {
    void importPortableProjectFile(file, 'pipelineTemplate');
  }, [importPortableProjectFile]);
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
    selectedSectionSet: graph.selectedSectionSet,
    selectedSet: graph.selectedSet,
  });
  const startSectionDrag = useSectionDrag({
    closeContextMenu: contextMenu.closeContextMenu,
    moveSectionBy: graph.moveSectionBy,
    moveSelectedNodesBy: graph.moveSelectedNodesBy,
    nodes: graph.nodes,
    pushHistory: graph.pushHistory,
    screenToWorld: canvas.screenToWorld,
    selectSection: graph.selectSection,
    selectedNodeSet: graph.selectedSet,
    selectedSectionSet: graph.selectedSectionSet,
  });
  const startSectionResize = useSectionResize({
    pushHistory: graph.pushHistory,
    resizeSection: graph.resizeSection,
    screenToWorld: canvas.screenToWorld,
  });

  const createNode = useCallback((type: ProductionNodeType, position: { x: number; y: number }) => {
    const nodeId = graph.addNode(type, position);
    if (type === 'generateImage') {
      graph.setNodeUiState(nodeId, { collapsed: true });
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey || target?.closest('.image-viewer-overlay')) return;

      if (event.shiftKey && event.code === 'KeyS') {
        event.preventDefault();
        setCanvasTool('section');
        closeContextMenu();
        return;
      }

      if (!event.shiftKey && event.code === 'KeyV') {
        event.preventDefault();
        setCanvasTool('select');
        closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeContextMenu]);

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
    if (event.shiftKey && target.closest('[data-canvas-section]')) return;
    closeContextMenu();
    if (canvasTool === 'section') {
      sectionDrawing.startSectionDrawing(event);
      return;
    }
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
    graph.setNodeUiState(nodeId, { collapsed: open ? false : true });
  }, [graph]);

  const cursor = canvas.isPanning || sectionDrawing.isDrawingSection
    ? canvas.isPanning ? 'grabbing' : 'crosshair'
    : canvasTool === 'section' || boxSelection.isSelecting ? 'crosshair' : undefined;

  return {
    bounds: graph.bounds,
    boxSelection,
    canvas,
    canvasTool,
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
    importPipelineTemplateFile,
    importProjectSnapshotFile,
    measuredPortPoints,
    nodes: graph.nodes,
    nodesById: graph.nodesById,
    openCanvasMenu,
    openNodeMenu,
    exportPipelineTemplate,
    exportProjectSnapshot,
    redo: graph.redo,
    renameSection: graph.renameSection,
    deleteSelected: graph.deleteSelected,
    selectedSet: graph.selectedSet,
    selectedSectionSet: graph.selectedSectionSet,
    selectSection: graph.selectSection,
    sectionDraftStyle: sectionDrawing.sectionDraftStyle,
    sections: graph.sections,
    setCanvasTool,
    startConnection,
    startNodeDrag,
    startSectionDrag,
    startSectionResize,
    toastMessage,
    toggleGenerateComposing,
    undo: graph.undo,
  };
}
