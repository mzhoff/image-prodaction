'use client';

import { useCallback, useRef, useState } from 'react';
import { getTextPromptVariablePortIndex, getPortById } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getActiveAssetScopeSnapshot } from '@/entities/production-graph/lib/remote-asset';
import { loadVideoModels } from '@/shared/api/video-model-catalog';
import type { NodeAskAiLaunchResult } from '@/features/chat-assistant/model/node-ask-ai';
import { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { createConnectMenuActions, getConnectCreateOptions, getConnectCreateSourceOptions } from '../lib/connect-create-menu';
import { preparePipelineConnectCreate } from '../lib/prepare-pipeline-connect-create';
import { getVideoConnectCreateMode, prepareVideoConnectCreate } from '../lib/prepare-video-connect-create';
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
  const canvas = useCanvasNavigation({
    initialPan: { x: graph.uiState.viewport.x, y: graph.uiState.viewport.y },
    initialZoom: graph.uiState.viewport.zoom,
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
    contextMenu.openContextMenuAt(drop.screenPoint.x, drop.screenPoint.y, createConnectMenuActions(options, async (option) => {
      let videoPreparation: ReturnType<typeof prepareVideoConnectCreate> | undefined;
      if (drop.direction === 'from-output' && option.type === 'generateVideo' && drop.sourceNodeId && drop.sourcePortId) {
        const before = useProductionGraphStore.getState();
        const scope = getActiveAssetScopeSnapshot();
        const mode = getVideoConnectCreateMode(drop.sourceNodeId, drop.sourcePortId, before);
        if (mode) {
          try {
            showToast('Подбираем видеомодель для подключения…');
            videoPreparation = prepareVideoConnectCreate(mode, await loadVideoModels());
            const latest = useProductionGraphStore.getState();
            if (getActiveAssetScopeSnapshot() !== scope || getVideoConnectCreateMode(drop.sourceNodeId, drop.sourcePortId, latest) !== mode) {
              throw new Error('Источник изменился. Протяните подключение ещё раз.');
            }
          } catch (error) {
            showToast(error instanceof Error ? error.message : 'Не удалось подготовить подключение к видео.');
            setPendingConnectionMenu(null);
            return;
          }
        }
      }
      const nodeId = createNode(option.type, drop.worldPoint);
      if (videoPreparation) graph.updateNodeDataSilent(nodeId, videoPreparation.data);
      if (drop.direction === 'from-output' && option.type === 'textPrompt' && option.targetPortId) {
        const variableIndex = getTextPromptVariablePortIndex(option.targetPortId);
        graph.updateNodeDataSilent(nodeId, {
          variables: [{
            id: option.targetPortId,
            alias: `Variable ${variableIndex >= 0 ? variableIndex + 1 : 1}`,
          }],
        });
      }
      const { sourcePortId, targetPortId } = preparePipelineConnectCreate(nodeId,
        videoPreparation ? { ...option, targetPortId: videoPreparation.targetPortId } : option);
      const result = drop.direction === 'from-output'
        ? drop.sourceNodeId && drop.sourcePortId && targetPortId
          ? graph.connect(drop.sourceNodeId, drop.sourcePortId, nodeId, targetPortId)
          : { ok: false as const, reason: 'Could not create a downstream connection.' }
        : drop.targetNodeId && drop.targetPortId && sourcePortId
          ? graph.connect(nodeId, sourcePortId, drop.targetNodeId, drop.targetPortId)
          : { ok: false as const, reason: 'Could not create an upstream connection.' };
      if (!result.ok) showToast(result.reason);
      else if (videoPreparation) showToast('Видео подключено. Добавьте задание и проверьте настройки перед генерацией.');
      setPendingConnectionMenu(null);
    }));
  }, [contextMenu, createNode, graph, showToast]);

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
