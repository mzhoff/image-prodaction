'use client';

import { useMemo } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getGraphBounds } from '../lib/edge-path';

export function useProductionCanvasStore() {
  const nodes = useProductionGraphStore((state) => state.nodes);
  const sections = useProductionGraphStore((state) => state.sections);
  const edges = useProductionGraphStore((state) => state.edges);
  const selectedNodeIds = useProductionGraphStore((state) => state.selectedNodeIds);
  const selectedSectionIds = useProductionGraphStore((state) => state.selectedSectionIds);
  const addNode = useProductionGraphStore((state) => state.addNode);
  const addSection = useProductionGraphStore((state) => state.addSection);
  const connect = useProductionGraphStore((state) => state.connect);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const deleteSelected = useProductionGraphStore((state) => state.deleteSelected);
  const exportPipelineTemplate = useProductionGraphStore((state) => state.exportPipelineTemplate);
  const exportProjectSnapshot = useProductionGraphStore((state) => state.exportProjectSnapshot);
  const historyPastLength = useProductionGraphStore((state) => state.historyPast.length);
  const historyFutureLength = useProductionGraphStore((state) => state.historyFuture.length);
  const importPortableProject = useProductionGraphStore((state) => state.importPortableProject);
  const moveNode = useProductionGraphStore((state) => state.moveNode);
  const moveSelectedNodesBy = useProductionGraphStore((state) => state.moveSelectedNodesBy);
  const moveSectionBy = useProductionGraphStore((state) => state.moveSectionBy);
  const pasteImageAsset = useProductionGraphStore((state) => state.pasteImageAsset);
  const pasteNodes = useProductionGraphStore((state) => state.pasteNodes);
  const pushHistory = useProductionGraphStore((state) => state.pushHistory);
  const redo = useProductionGraphStore((state) => state.redo);
  const resetProject = useProductionGraphStore((state) => state.resetProject);
  const selectNode = useProductionGraphStore((state) => state.selectNode);
  const selectNodesInRect = useProductionGraphStore((state) => state.selectNodesInRect);
  const selectSection = useProductionGraphStore((state) => state.selectSection);
  const renameSection = useProductionGraphStore((state) => state.renameSection);
  const resizeSection = useProductionGraphStore((state) => state.resizeSection);
  const setNodeUiState = useProductionGraphStore((state) => state.setNodeUiState);
  const setProjectUiViewport = useProductionGraphStore((state) => state.setProjectUiViewport);
  const undo = useProductionGraphStore((state) => state.undo);
  const uiState = useProductionGraphStore((state) => state.uiState);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedSectionSet = useMemo(() => new Set(selectedSectionIds), [selectedSectionIds]);
  const bounds = useMemo(() => getGraphBounds(nodes, sections), [nodes, sections]);

  return useMemo(() => ({
    addNode,
    addSection,
    bounds,
    connect,
    deleteEdge,
    deleteSelected,
    edges,
    exportPipelineTemplate,
    exportProjectSnapshot,
    historyFutureLength,
    historyPastLength,
    importPortableProject,
    moveNode,
    moveSelectedNodesBy,
    moveSectionBy,
    nodes,
    nodesById,
    pasteImageAsset,
    pasteNodes,
    pushHistory,
    redo,
    resetProject,
    renameSection,
    resizeSection,
    selectNode,
    selectSection,
    selectedSet,
    selectedSectionSet,
    selectNodesInRect,
    setNodeUiState,
    setProjectUiViewport,
    sections,
    uiState,
    undo,
  }), [
    addNode,
    addSection,
    bounds,
    connect,
    deleteEdge,
    deleteSelected,
    edges,
    exportPipelineTemplate,
    exportProjectSnapshot,
    historyFutureLength,
    historyPastLength,
    importPortableProject,
    moveNode,
    moveSelectedNodesBy,
    moveSectionBy,
    nodes,
    nodesById,
    pasteImageAsset,
    pasteNodes,
    pushHistory,
    redo,
    resetProject,
    renameSection,
    resizeSection,
    selectNode,
    selectSection,
    selectedSet,
    selectedSectionSet,
    selectNodesInRect,
    setNodeUiState,
    setProjectUiViewport,
    sections,
    uiState,
    undo,
  ]);
}
