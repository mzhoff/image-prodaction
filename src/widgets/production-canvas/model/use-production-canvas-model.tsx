'use client';

import { useCallback, useRef, useState } from 'react';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { DEFAULT_PROJECT_VIEWPORT } from '@/entities/production-graph/model/project-schema';
import type { NodeAskAiLaunchResult } from '@/features/chat-assistant/model/node-ask-ai';
import { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { useConnectionCreateMenu } from './use-connection-create-menu';
import { useCanvasClipboard } from './use-canvas-clipboard';
import { useCanvasLibraryImport } from './use-canvas-library-import';
import { useCanvasImageImport } from './use-canvas-image-import';
import { useCanvasImageViewer } from './use-canvas-image-viewer';
import { useCanvasFavoriteNodes } from './use-canvas-favorite-nodes';
import { useCanvasNodeTemplates } from './use-canvas-node-templates';
import { useCanvasSelectedCollapse } from './use-canvas-selected-collapse';
import { useCanvasNodeFactory } from './use-canvas-node-factory';
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
  onAskAiNode: (node: ProductionNode) => Promise<NodeAskAiLaunchResult>;
  projectId?: string;
}
export function useProductionCanvasModel(options: ProductionCanvasModelOptions) {
  const { onAskAiNode, projectId } = options;
  const contextMenu = useContextMenu();
  const graph = useProductionCanvasStore();
  const initialViewport = projectId ? DEFAULT_PROJECT_VIEWPORT : graph.uiState.viewport;
  const canvas = useCanvasNavigation({
    initialPan: { x: initialViewport.x, y: initialViewport.y },
    initialZoom: initialViewport.zoom,
  });
  const { showToast, toastMessage } = useCanvasToast();
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [pendingConnectionMenu, setPendingConnectionMenu] = useState<ConnectionDropOnEmpty | null>(null);
  const [sectionColorPreviews, setSectionColorPreviews] = useState<Record<string, string>>({});
  const lastPointerWorldRef = useRef({ x: 0, y: 0 });
  const { copyAssetToClipboard, downloadAssets, imageViewer, openImageViewer } = useCanvasImageViewer({
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

  const { importImageFile, importImageFiles, importProgressStore } = useCanvasImageImport({ getFallbackPastePosition, pasteImageAsset: graph.pasteImageAsset, showToast });
  const importLibraryImage = useCanvasLibraryImport({
    projectId,
    ready: ['saved', 'dirty', 'saving', 'recovery'].includes(documentSync.syncState.phase),
    documentStatus: documentSync.documentStatus,
    getPosition: getFallbackPastePosition,
    showToast,
  });
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
    enabled: documentSync.documentReady,
    deleteSelected: graph.deleteSelected,
    importImageFile,
    importLibraryImage,
    lastPointerWorldRef,
    pasteNodes: graph.pasteNodes,
    redo: graph.redo,
    undo: graph.undo,
  });

  const startNodeDrag = useNodeDrag({
    measuredPortPoints,
    collapsedGenerateComposingNodeIds,
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

  const createNode = useCanvasNodeFactory(graph);

  const openConnectionCreateMenu = useConnectionCreateMenu({ contextMenu, createNode, graph, showToast, setPendingConnectionMenu });

  const { clearConnectionDraft, connectionDraft, draftPathRef, startConnection } = useConnectionDraft({
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
    createNode(type, getFallbackPastePosition());
    closeContextMenu();
  }, [closeContextMenu, createNode, getFallbackPastePosition]);

  const favoriteNodes = useCanvasFavoriteNodes({
    closeContextMenu,
    getPalettePosition: getFallbackPastePosition,
    graph,
    showToast,
    workspaceId: documentSync.workspaceId,
  });
  const nodeTemplates = useCanvasNodeTemplates({
    closeContextMenu, getPalettePosition: getFallbackPastePosition,
    graph, projectId, showToast, workspaceId: documentSync.workspaceId,
  });
  const toggleCollapsedStateForSelectedNodes = useCanvasSelectedCollapse(graph);

  const { openCanvasMenu, openNodeMenu, openNodeOptionsMenu, openSectionMenu } =
    useProductionCanvasMenus({
      canvas, closeContextMenu, contextMenu, copyAssetToClipboard, createNode, downloadAssets,
      favoriteNodes,
      exportSectionPipelineTemplate, graph, importPipelineTemplateAt, openImageViewer,
      nodeTemplates, onAskAiNode, projectId, sectionColorPreviews, setSectionColorPreviews,
      showToast, studioPipelines,
    });
  const { cursor, handleCanvasDragOver, handleCanvasDrop, handleCanvasMouseDown,
    handleCanvasMouseMove } = useProductionCanvasInteractions({
    enabled: documentSync.documentReady,
    boxSelection, canvas, canvasTool, closeContextMenu,
    createFavoriteNode: favoriteNodes.createFavoriteNode, createNode,
    createTemplateNode: nodeTemplates.createTemplateNode,
    getFallbackPastePosition, importImageFiles, lastPointerWorldRef,
    nodesById: graph.nodesById, sectionDrawing, setCanvasTool, showToast,
    toggleCollapsedStateForSelectedNodes,
  });

  const toggleGenerateComposing = useCallback((nodeId: string, open: boolean) => {
    graph.setNodeUiState(nodeId, { state: open ? 'Expanded' : 'Collapsed' });
  }, [graph]);

  const focusNode = useCallback((nodeId: string) => {
    const node = graph.nodesById.get(nodeId);
    if (!node) return;
    graph.selectNode(nodeId, false);
    canvas.zoomToBounds({
      minX: node.position.x,
      minY: node.position.y,
      maxX: node.position.x + node.size.width,
      maxY: node.position.y + node.size.height,
    }, 180);
  }, [canvas, graph]);

  return {
    bounds: graph.bounds,
    boxSelection,
    canvas,
    canvasTool,
    closeContextMenu,
    collapsedGenerateComposingNodeIds,
    connectionDraft,
    draftPathRef,
    contextMenu,
    createFavoriteNodeFromPalette: favoriteNodes.createFavoriteNodeFromPalette,
    createTemplateNodeFromPalette: nodeTemplates.createTemplateNodeFromPalette,
    createNodeFromPalette,
    cursor,
    edges: graph.edges,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    historyFutureLength: graph.historyFutureLength,
    historyPastLength: graph.historyPastLength,
    favoriteNodesError: favoriteNodes.error,
    favoriteNodes: favoriteNodes.favorites,
    favoriteNodesLoading: favoriteNodes.loading,
    focusNode,
    nodeTemplatesError: nodeTemplates.error,
    nodeTemplates: nodeTemplates.templates,
    nodeTemplatesLoading: nodeTemplates.loading,
    imageViewer,
    importProjectSnapshotFile,
    importProgressStore,
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
    documentReady: documentSync.documentReady,
    documentFavorite: documentSync.favorite,
    documentStatus: documentSync.documentStatus,
    documentThumbnailMode: documentThumbnail.thumbnailMode,
    documentThumbnailPending: documentThumbnail.manualCapturePending,
    createDocumentThumbnail: documentThumbnail.createManualSnapshot,
    prepareDocumentExit: documentThumbnail.prepareDocumentExit,
    moveDocumentToTrash: documentSync.moveDocumentToTrash,
    renameDocument: documentSync.renameDocument,
    reloadDocumentFromServer: documentSync.reloadFromServer,
    setDocumentFavorite: documentSync.setDocumentFavorite,
    documentSync: documentSync.syncState,
    documentRevision: documentSync.revision,
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
    showToast,
    toastMessage,
    toggleGenerateComposing,
    undo: graph.undo,
  };
}
