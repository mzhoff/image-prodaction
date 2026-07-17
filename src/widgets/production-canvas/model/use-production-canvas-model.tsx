'use client';

import { Copy, Download, HelpCircle, Lock, Palette, Pencil, Maximize2, RotateCcw, Trash2, Unlock, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { getNodeCurrentImageAssetId, getNodeImageAssetIds } from '@/entities/production-graph/model/graph-io';
import { getTextPromptVariablePortIndex, getPortById, isNodeCollapsible } from '@/entities/production-graph/model/node-definitions';
import { DEFAULT_PROJECT_VIEWPORT } from '@/entities/production-graph/model/project-schema';
import type { GraphSection, ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { useDocumentBackendSync } from '@/entities/document/api/use-document-backend-sync';
import { requestNodeTitleRename } from '@/features/graph-node/ui/node-title';
import { hasImageFileInDataTransfer, getImageFilesFromDataTransfer } from '@/shared/lib/image-file';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { normalizeNodeDisplayState } from '@/entities/production-graph/model/project-schema';
import { createConnectMenuActions, getConnectCreateOptions, getConnectCreateSourceOptions } from '../lib/connect-create-menu';
import { NODE_DRAG_MIME_TYPE } from '../lib/node-drag';
import { useCanvasClipboard } from './use-canvas-clipboard';
import { useCanvasImageImport } from './use-canvas-image-import';
import { useCanvasImageViewer } from './use-canvas-image-viewer';
import { useCanvasProjectTransfer } from './use-canvas-project-transfer';
import { useCanvasToast } from './use-canvas-toast';
import { type ConnectionDropOnEmpty, useConnectionDraft } from './use-connection-draft';
import { useNodeDrag } from './use-node-drag';
import { usePortPointMeasurement } from './use-port-point-measurement';
import { useSectionDrag } from './use-section-drag';
import { useSectionDrawing } from './use-section-drawing';
import { useSectionResize } from './use-section-resize';
import { addNodeMenuGroups, createAddNodeContextMenuActions } from '../lib/add-node-menu';
import { useProductionCanvasStore } from './use-production-canvas-store';

export const CANVAS_WORLD_SIZE = 4000;
type CanvasTool = 'select' | 'section';

interface ProductionCanvasModelOptions {
  projectId?: string;
}

export function useProductionCanvasModel(options: ProductionCanvasModelOptions = {}) {
  const { projectId } = options;
  const contextMenu = useContextMenu();
  const graph = useProductionCanvasStore();
  const canvas = useCanvasNavigation({
    initialPan: { x: graph.uiState.viewport.x, y: graph.uiState.viewport.y },
    initialZoom: graph.uiState.viewport.zoom,
  });
  const { showToast, toastMessage } = useCanvasToast();
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [pendingConnectionMenu, setPendingConnectionMenu] = useState<ConnectionDropOnEmpty | null>(null);
  const [sectionColorPreviews, setSectionColorPreviews] = useState<Record<string, string>>({});
  const didInitialFitRef = useRef(false);
  const didApplyRestoredViewportRef = useRef(false);
  const lastPointerWorldRef = useRef({ x: 0, y: 0 });
  const hasRestoredViewport = graph.uiState.viewport.x !== DEFAULT_PROJECT_VIEWPORT.x
    || graph.uiState.viewport.y !== DEFAULT_PROJECT_VIEWPORT.y
    || graph.uiState.viewport.zoom !== DEFAULT_PROJECT_VIEWPORT.zoom;
  const collapsedGenerateComposingNodeIds = useMemo(() => new Set(
    graph.nodes
      .filter((node) => (
        node.type === 'generateImage'
        && normalizeNodeDisplayState(graph.uiState.nodes[node.id]) === 'Collapsed'
      ))
      .map((node) => node.id),
  ), [graph.nodes, graph.uiState.nodes]);
  const { downloadAssets, imageViewer, openImageViewer } = useCanvasImageViewer({
    assets: graph.assets,
    nodesById: graph.nodesById,
    showToast,
  });
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
  const exportProjectSnapshotForRoute = graph.exportProjectSnapshot;
  const importPortableProjectForRoute = graph.importPortableProject;
  const resetProjectForRoute = graph.resetProject;
  const subscribeToProjectChanges = useCallback((listener: () => void) => (
    useProductionGraphStore.subscribe((state, previous) => {
      if (
        state.version !== previous.version
        || state.nodes !== previous.nodes
        || state.sections !== previous.sections
        || state.edges !== previous.edges
        || state.assets !== previous.assets
        || state.presets !== previous.presets
        || state.subjects !== previous.subjects
        || state.locations !== previous.locations
        || state.publications !== previous.publications
        || state.runs !== previous.runs
        || state.uiState !== previous.uiState
      ) listener();
    })
  ), []);
  const documentSync = useDocumentBackendSync({
    exportSnapshot: exportProjectSnapshotForRoute,
    importSnapshot: importPortableProjectForRoute,
    projectId,
    resetProject: resetProjectForRoute,
    subscribeToProjectChanges,
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

  const { importImageFile, importImageFiles } = useCanvasImageImport({ getFallbackPastePosition, pasteImageAsset: graph.pasteImageAsset });
  const {
    exportSectionPipelineTemplate,
    exportProjectSnapshot,
    importPipelineTemplateAt,
    importProjectSnapshotFile,
  } = useCanvasProjectTransfer({
    exportPipelineTemplateForSection: graph.exportPipelineTemplateForSection,
    exportProjectSnapshot: graph.exportProjectSnapshot,
    importPipelineTemplateAt: graph.importPipelineTemplateAt,
    importPortableProject: graph.importPortableProject,
    showToast,
  });
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
    sections: graph.sections,
  });
  const startSectionResize = useSectionResize({
    pushHistory: graph.pushHistory,
    resizeSection: graph.resizeSection,
    screenToWorld: canvas.screenToWorld,
  });

  const createNode = useCallback((type: ProductionNodeType, position: { x: number; y: number }) => {
    const nodeId = graph.addNode(type, position);
    if (type === 'generateImage') {
      graph.setNodeUiState(nodeId, { state: 'Collapsed' });
    }
    return nodeId;
  }, [graph]);

  const openConnectionCreateMenu = useCallback((drop: ConnectionDropOnEmpty) => {
    const source = drop.sourceNodeId ? graph.nodesById.get(drop.sourceNodeId) : undefined;
    const target = drop.targetNodeId ? graph.nodesById.get(drop.targetNodeId) : undefined;
    const sourcePort = source && drop.sourcePortId ? getPortById(source, drop.sourcePortId) : undefined;
    const targetPort = target && drop.targetPortId ? getPortById(target, drop.targetPortId) : undefined;
    const options = drop.direction === 'from-output'
      ? sourcePort ? getConnectCreateOptions(sourcePort.kind) : []
      : targetPort ? getConnectCreateSourceOptions(targetPort.kind, drop.targetPortId) : [];
    if (options.length === 0) {
      setPendingConnectionMenu(null);
      return;
    }

    setPendingConnectionMenu(drop);
    contextMenu.openContextMenuAt(drop.screenPoint.x, drop.screenPoint.y, createConnectMenuActions(options, (option) => {
      const nodeId = createNode(option.type, drop.worldPoint);
      if (drop.direction === 'from-output' && option.type === 'textPrompt' && option.targetPortId) {
        const variableIndex = getTextPromptVariablePortIndex(option.targetPortId);
        graph.updateNodeDataSilent(nodeId, {
          variables: [{
            id: option.targetPortId,
            alias: `Variable ${variableIndex >= 0 ? variableIndex + 1 : 1}`,
          }],
        });
      }
      const result = drop.direction === 'from-output'
        ? drop.sourceNodeId && drop.sourcePortId && option.targetPortId
          ? graph.connect(drop.sourceNodeId, drop.sourcePortId, nodeId, option.targetPortId)
          : { ok: false as const, reason: 'Could not create a downstream connection.' }
        : drop.targetNodeId && drop.targetPortId && option.sourcePortId
          ? graph.connect(nodeId, option.sourcePortId, drop.targetNodeId, drop.targetPortId)
          : { ok: false as const, reason: 'Could not create an upstream connection.' };
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
    setSectionColorPreviews({});
    contextMenu.closeContextMenu();
  }, [clearConnectionDraft, contextMenu, pendingConnectionMenu]);

  const createNodeFromPalette = useCallback((type: ProductionNodeType) => {
    const container = canvas.containerRef.current;
    const rect = container?.getBoundingClientRect();
    const position = rect
      ? canvas.screenToWorld({
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }) ?? lastPointerWorldRef.current
      : lastPointerWorldRef.current;
    createNode(type, position);
    closeContextMenu();
  }, [canvas, closeContextMenu, createNode]);

  const getSectionMenuActions = useCallback((section: GraphSection): ContextMenuAction[] => [
    {
      id: 'export-section-pipeline',
      label: 'Export Pipeline',
      icon: <Download size={14} />,
      onSelect: () => exportSectionPipelineTemplate(section.id, section.title),
    },
    {
      id: 'rename-section',
      label: 'Rename group',
      icon: <Pencil size={14} />,
      onSelect: () => {
        const title = window.prompt('Group name', section.title);
        if (title) graph.renameSection(section.id, title);
      },
    },
    {
      id: 'duplicate-section',
      label: 'Duplicate group',
      icon: <Copy size={14} />,
      onSelect: () => graph.duplicateSection(section.id),
    },
    {
      id: 'section-color',
      kind: 'color',
      label: 'Background',
      icon: <Palette size={14} />,
      value: sectionColorPreviews[section.id] ?? section.color ?? '#d9d9d9',
      onPreview: (color) => {
        setSectionColorPreviews((previews) => ({ ...previews, [section.id]: color }));
      },
      onCommit: (color) => {
        setSectionColorPreviews((previews) => {
          const { [section.id]: _preview, ...nextPreviews } = previews;
          return nextPreviews;
        });
        graph.setSectionColor(section.id, color);
      },
    },
    {
      id: 'toggle-section-lock',
      label: section.locked ? 'Unlock group' : 'Lock group',
      icon: section.locked ? <Unlock size={14} /> : <Lock size={14} />,
      separatorBefore: true,
      onSelect: () => graph.toggleSectionLock(section.id),
    },
    {
      id: 'delete-section',
      label: 'Delete group',
      icon: <Trash2 size={14} />,
      destructive: true,
      separatorBefore: true,
      onSelect: () => graph.deleteSection(section.id),
    },
  ], [exportSectionPipelineTemplate, graph, sectionColorPreviews]);

  const getCanvasMenuActions = useCallback((worldPoint: { x: number; y: number }): ContextMenuAction[] => [
    {
      id: 'import-pipeline',
      label: 'Import Pipeline',
      icon: <Upload size={14} />,
      onSelect: () => importPipelineTemplateAt(worldPoint),
    },
    ...addNodeMenuGroups.map((group) => ({
      id: `add-group-${group.id}`,
      kind: 'submenu' as const,
      label: group.label,
      icon: group.icon,
      actions: createAddNodeContextMenuActions(group.items, (type) => createNode(type, worldPoint)),
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
  ], [canvas, createNode, graph, importPipelineTemplateAt]);

  const openCanvasMenu = useCallback((event: ReactMouseEvent) => {
    const worldPoint = canvas.screenToWorld(event.nativeEvent) ?? { x: 0, y: 0 };
    closeContextMenu();
    contextMenu.openContextMenu(event, getCanvasMenuActions(worldPoint));
  }, [canvas, closeContextMenu, contextMenu, getCanvasMenuActions]);

  const getNodeMenuActions = useCallback((node: ProductionNode): ContextMenuAction[] => {
    const assetIds = getNodeImageAssetIds(node);
    const currentAssetId = getNodeCurrentImageAssetId(node);
    const currentIndex = currentAssetId ? Math.max(0, assetIds.indexOf(currentAssetId)) : -1;
    const imageActions: ContextMenuAction[] = currentAssetId ? [
      {
        id: 'open-node-image',
        label: 'Expand fullscreen',
        icon: <Maximize2 size={14} />,
        separatorBefore: true,
        onSelect: () => openImageViewer(node.id, currentIndex >= 0 ? currentIndex : 0),
      },
      {
        id: 'download-current-node-image',
        label: 'Download current',
        icon: <Download size={14} />,
        onSelect: () => void downloadAssets([currentAssetId]),
      },
      {
        id: 'download-all-node-images',
        label: 'Download all',
        icon: <Download size={14} />,
        disabled: assetIds.length <= 1,
        onSelect: () => void downloadAssets(assetIds),
      },
    ] : [];
    const generationActions: ContextMenuAction[] = hasClearableGenerationData(node) ? [
      {
        id: 'remove-node-generations',
        label: 'Remove all generations',
        icon: <Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => graph.clearNodeGenerations(node.id),
      },
    ] : [];

    const baseActions: ContextMenuAction[] = [
      {
        id: 'ask-ai-node',
        label: 'Ask AI',
        icon: <HelpCircle size={14} />,
        onSelect: () => showToast('Ask AI assistant will be connected in the product chat.'),
      },
      {
        id: 'rename-node',
        label: 'Rename',
        icon: <Pencil size={14} />,
        onSelect: () => requestNodeTitleRename(node.id),
      },
      {
        id: 'copy-node',
        label: 'Duplicate',
        icon: <Copy size={14} />,
        onSelect: () => graph.duplicateNode(node.id),
      },
      {
        id: 'toggle-node-lock',
        label: node.locked ? 'Unlock' : 'Lock',
        icon: node.locked ? <Unlock size={14} /> : <Lock size={14} />,
        onSelect: () => graph.toggleNodeLock(node.id),
      },
    ];
    const bannerActions = node.type === 'banner'
      ? baseActions.filter((action) => action.id !== 'ask-ai-node' && action.id !== 'rename-node')
      : baseActions;

    return [
      ...bannerActions,
      ...imageActions,
      ...generationActions,
      {
        id: 'delete-node',
        label: 'Delete',
        icon: <Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        onSelect: graph.deleteSelected,
      },
    ];
  }, [downloadAssets, graph, openImageViewer, showToast]);

  const openNodeMenuAt = useCallback((node: ProductionNode, x: number, y: number) => {
    graph.selectNode(node.id);
    closeContextMenu();
    contextMenu.openContextMenuAt(x, y, getNodeMenuActions(node), 244);
  }, [closeContextMenu, contextMenu, getNodeMenuActions, graph]);

  const openNodeMenu = useCallback((node: ProductionNode, event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openNodeMenuAt(node, event.clientX, event.clientY);
  }, [openNodeMenuAt]);

  const openNodeOptionsMenu = useCallback((node: ProductionNode, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openNodeMenuAt(node, rect.right - 4, rect.bottom + 4);
  }, [openNodeMenuAt]);

  const toggleCollapsedStateForSelectedNodes = useCallback(() => {
    const candidateNodeIds = Array.from(graph.selectedSet).flatMap((nodeId) => {
      const node = graph.nodesById.get(nodeId);
      if (!node || !isNodeCollapsible(node.type)) return [];
      return [node.id];
    });

    if (candidateNodeIds.length === 0) return;

    const shouldCollapse = !candidateNodeIds.every((nodeId) => normalizeNodeDisplayState(graph.uiState.nodes[nodeId]) === 'Collapsed');
    const nextState = shouldCollapse ? 'Collapsed' : 'Expanded';
    candidateNodeIds.forEach((nodeId) => graph.setNodeUiState(nodeId, { state: nextState }));
  }, [graph.selectedSet, graph.nodesById, graph.setNodeUiState, graph.uiState.nodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping || target?.closest('.image-viewer-overlay')) return;

      if (event.ctrlKey || event.metaKey || event.altKey) {
        if (event.shiftKey && event.code === 'KeyH') {
          event.preventDefault();
          toggleCollapsedStateForSelectedNodes();
          return;
        }
        return;
      }

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
  }, [closeContextMenu, setCanvasTool, toggleCollapsedStateForSelectedNodes]);

  const openSectionMenu = useCallback((section: GraphSection, event: ReactMouseEvent) => {
    closeContextMenu();
    if (graph.selectedSectionSet.has(section.id)) {
      contextMenu.openContextMenu(event, getSectionMenuActions(section), 236);
      return;
    }

    const worldPoint = canvas.screenToWorld(event.nativeEvent) ?? { x: 0, y: 0 };
    contextMenu.openContextMenu(event, getCanvasMenuActions(worldPoint));
  }, [canvas, closeContextMenu, contextMenu, getCanvasMenuActions, getSectionMenuActions, graph.selectedSectionSet]);

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
    if (!hasDraggedNodeType(event.dataTransfer) && !hasImageFileInDataTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const draggedNodeType = getDraggedNodeType(event.dataTransfer);
    if (draggedNodeType) {
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
      createNode(draggedNodeType, canvas.screenToWorld(event.nativeEvent) ?? getFallbackPastePosition());
      return;
    }

    const imageFiles = getImageFilesFromDataTransfer(event.dataTransfer, 'dropped-image');
    if (imageFiles.length === 0) return;
    event.preventDefault();
    event.stopPropagation();

    closeContextMenu();

    const dropPoint = canvas.screenToWorld(event.nativeEvent) ?? getFallbackPastePosition();
    const targetImportNodeId = getDropTargetImportNodeId(event, graph.nodesById);
    void importImageFiles(imageFiles, dropPoint, targetImportNodeId).then(() => {
      if (imageFiles.length > 1) showToast(`${imageFiles.length} images imported.`);
    });
  };

  const toggleGenerateComposing = useCallback((nodeId: string, open: boolean) => {
    graph.setNodeUiState(nodeId, { state: open ? 'Expanded' : 'Collapsed' });
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
    createNodeFromPalette,
    cursor,
    edges: graph.edges,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    historyFutureLength: graph.historyFutureLength,
    historyPastLength: graph.historyPastLength,
    imageViewer,
    importProjectSnapshotFile,
    measuredPortPoints,
    nodes: graph.nodes,
    nodesById: graph.nodesById,
    openCanvasMenu,
    openNodeMenu,
    openNodeOptionsMenu,
    openSectionMenu,
    exportProjectSnapshot,
    redo: graph.redo,
    renameSection: graph.renameSection,
    deleteSelected: graph.deleteSelected,
    documentName: documentSync.documentName,
    documentSync: documentSync.syncState,
    workspaceId: documentSync.workspaceId,
    selectedSet: graph.selectedSet,
    selectedSectionSet: graph.selectedSectionSet,
    selectSection: graph.selectSection,
    sectionDraftStyle: sectionDrawing.sectionDraftStyle,
    sectionColorPreviews,
    sections: graph.sections,
    setCanvasTool,
    startConnection,
    startNodeDrag,
    startSectionDrag,
    startSectionResize,
    showAssistantHint: () => showToast('Assistant will be connected in the product chat.'),
    toastMessage,
    toggleGenerateComposing,
    undo: graph.undo,
  };
}

function getNodeTitle(node: ProductionNode) {
  return node.data.title || node.type;
}

function getDropTargetImportNodeId(event: ReactDragEvent<HTMLElement>, nodesById: Map<string, ProductionNode>) {
  const target = event.target instanceof Element ? event.target : null;
  const nodeId = target?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
  const node = nodeId ? nodesById.get(nodeId) : undefined;
  return node?.type === 'importImage' ? node.id : undefined;
}

function getDraggedNodeType(dataTransfer: DataTransfer) {
  const value = dataTransfer.getData(NODE_DRAG_MIME_TYPE);
  return value ? value as ProductionNodeType : null;
}

function hasDraggedNodeType(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(NODE_DRAG_MIME_TYPE);
}

function hasClearableGenerationData(node: ProductionNode) {
  const data = node.data as unknown as Record<string, unknown>;
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    return Boolean(data.resultAssetId) || (Array.isArray(data.resultAssetIds) && data.resultAssetIds.length > 0);
  }
  if (node.type === 'textGeneration') {
    return Boolean(data.result) || (Array.isArray(data.resultTexts) && data.resultTexts.length > 0);
  }
  if (node.type === 'subjectBuilder' || node.type === 'locationBuilder') {
    return Array.isArray(data.libraryImageAssetIds) && data.libraryImageAssetIds.length > 0;
  }
  return Boolean(data.resultAssetId);
}
