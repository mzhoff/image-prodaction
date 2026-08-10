'use client';

import { useCallback, useRef, useState } from 'react';
import { getTextPromptVariablePortIndex, getPortById, isNodeCollapsible } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { normalizeNodeDisplayState } from '@/entities/production-graph/model/project-schema';
import { createConnectMenuActions, getConnectCreateOptions, getConnectCreateSourceOptions } from '../lib/connect-create-menu';
import { useCanvasClipboard } from './use-canvas-clipboard';
import { useCanvasImageImport } from './use-canvas-image-import';
import { useCanvasImageViewer } from './use-canvas-image-viewer';
import { useCanvasProjectTransfer } from './use-canvas-project-transfer';
import { useCanvasToast } from './use-canvas-toast';
import { type ConnectionDropOnEmpty, useConnectionDraft } from './use-connection-draft';
import { useNodeDrag } from './use-node-drag';
import { useSectionDrag } from './use-section-drag';
import { useSectionDrawing } from './use-section-drawing';
import { useSectionResize } from './use-section-resize';
import { useProductionCanvasStore } from './use-production-canvas-store';
import { useProductionCanvasInteractions } from './use-production-canvas-interactions';
import { useProductionCanvasMenus } from './use-production-canvas-menus';
import { useProductionCanvasMeasurements } from './use-production-canvas-measurements';
import { useProductionCanvasPersistence } from './use-production-canvas-persistence';
import type { CanvasTool } from './production-canvas-values';

export const CANVAS_WORLD_SIZE = 4000;

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
  const lastPointerWorldRef = useRef({ x: 0, y: 0 });
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
  const { collapsedGenerateComposingNodeIds,
    measuredPortPoints } = useProductionCanvasMeasurements(graph, canvas);
  const { documentSync, documentThumbnail,
    studioPipelines } = useProductionCanvasPersistence({ canvas, graph, projectId });

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
  }, [graph]);

  const { openCanvasMenu, openNodeMenu, openNodeOptionsMenu, openSectionMenu } =
    useProductionCanvasMenus({
      canvas, closeContextMenu, contextMenu, createNode, downloadAssets,
      exportSectionPipelineTemplate, graph, importPipelineTemplateAt, openImageViewer,
      projectId, sectionColorPreviews, setSectionColorPreviews, showToast, studioPipelines,
    });
  const { cursor, handleCanvasDragOver, handleCanvasDrop, handleCanvasMouseDown,
    handleCanvasMouseMove } = useProductionCanvasInteractions({
    boxSelection, canvas, canvasTool, closeContextMenu, createNode,
    getFallbackPastePosition, importImageFiles, lastPointerWorldRef,
    nodesById: graph.nodesById, sectionDrawing, setCanvasTool, showToast,
    toggleCollapsedStateForSelectedNodes,
  });

  const toggleGenerateComposing = useCallback((nodeId: string, open: boolean) => {
    graph.setNodeUiState(nodeId, { state: open ? 'Expanded' : 'Collapsed' });
  }, [graph]);

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
    documentFavorite: documentSync.favorite,
    documentStatus: documentSync.documentStatus,
    documentThumbnailMode: documentThumbnail.thumbnailMode,
    documentThumbnailPending: documentThumbnail.manualCapturePending,
    createDocumentThumbnail: documentThumbnail.createManualSnapshot,
    moveDocumentToTrash: documentSync.moveDocumentToTrash,
    renameDocument: documentSync.renameDocument,
    setDocumentFavorite: documentSync.setDocumentFavorite,
    documentSync: documentSync.syncState,
    workspaceId: documentSync.workspaceId,
    selectedSet: graph.selectedSet,
    selectedSectionSet: graph.selectedSectionSet,
    selectSection: graph.selectSection,
    sectionDraftStyle: sectionDrawing.sectionDraftStyle,
    sectionColorPreviews,
    sectionPublications: studioPipelines.publicationsBySectionId,
    sections: graph.sections,
    setCanvasTool,
    startConnection,
    startNodeDrag,
    startSectionDrag,
    startSectionResize,
    showAssistantHint: () => showToast('Assistant will be connected in the product chat.'),
    showToast,
    toastMessage,
    toggleGenerateComposing,
    undo: graph.undo,
  };
}
