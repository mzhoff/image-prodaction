'use client';

import { useMemo } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getGraphBounds } from '../lib/edge-path';

export function useProductionCanvasStore() {
  const nodes = useProductionGraphStore((state) => state.nodes);
  const sections = useProductionGraphStore((state) => state.sections);
  const edges = useProductionGraphStore((state) => state.edges);
  const assets = useProductionGraphStore((state) => state.assets);
  const selectedNodeIds = useProductionGraphStore((state) => state.selectedNodeIds);
  const selectedSectionIds = useProductionGraphStore((state) => state.selectedSectionIds);
  const addNode = useProductionGraphStore((state) => state.addNode);
  const addSection = useProductionGraphStore((state) => state.addSection);
  const compactDynamicInputSlots = useProductionGraphStore((state) => state.compactDynamicInputSlots);
  const compactTextConcatInputs = useProductionGraphStore((state) => state.compactTextConcatInputs);
  const connect = useProductionGraphStore((state) => state.connect);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const deleteSection = useProductionGraphStore((state) => state.deleteSection);
  const deleteSelected = useProductionGraphStore((state) => state.deleteSelected);
  const clearNodeGenerations = useProductionGraphStore((state) => state.clearNodeGenerations);
  const duplicateNode = useProductionGraphStore((state) => state.duplicateNode);
  const duplicateSection = useProductionGraphStore((state) => state.duplicateSection);
  const exportPipelineTemplateForSection = useProductionGraphStore((state) => state.exportPipelineTemplateForSection);
  const exportProjectSnapshot = useProductionGraphStore((state) => state.exportProjectSnapshot);
  const historyPastLength = useProductionGraphStore((state) => state.historyPast.length);
  const historyFutureLength = useProductionGraphStore((state) => state.historyFuture.length);
  const importPipelineTemplateAt = useProductionGraphStore((state) => state.importPipelineTemplateAt);
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
  const renameNode = useProductionGraphStore((state) => state.renameNode);
  const resizeSection = useProductionGraphStore((state) => state.resizeSection);
  const setNodeUiState = useProductionGraphStore((state) => state.setNodeUiState);
  const setProjectUiViewport = useProductionGraphStore((state) => state.setProjectUiViewport);
  const setSectionColor = useProductionGraphStore((state) => state.setSectionColor);
  const toggleSectionLock = useProductionGraphStore((state) => state.toggleSectionLock);
  const toggleNodeLock = useProductionGraphStore((state) => state.toggleNodeLock);
  const undo = useProductionGraphStore((state) => state.undo);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const uiState = useProductionGraphStore((state) => state.uiState);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedSectionSet = useMemo(() => new Set(selectedSectionIds), [selectedSectionIds]);
  const bounds = useMemo(() => getGraphBounds(nodes, sections), [nodes, sections]);

  return useMemo(() => ({
    addNode,
    addSection,
    assets,
    bounds,
    clearNodeGenerations,
    compactDynamicInputSlots,
    compactTextConcatInputs,
    connect,
    deleteEdge,
    deleteSection,
    deleteSelected,
    duplicateNode,
    duplicateSection,
    edges,
    exportPipelineTemplateForSection,
    exportProjectSnapshot,
    historyFutureLength,
    historyPastLength,
    importPipelineTemplateAt,
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
    renameNode,
    resizeSection,
    selectNode,
    selectSection,
    selectedSet,
    selectedSectionSet,
    selectNodesInRect,
    setNodeUiState,
    setProjectUiViewport,
    setSectionColor,
    sections,
    toggleSectionLock,
    toggleNodeLock,
    uiState,
    undo,
    updateNodeDataSilent,
  }), [
    addNode,
    addSection,
    assets,
    bounds,
    clearNodeGenerations,
    compactDynamicInputSlots,
    compactTextConcatInputs,
    connect,
    deleteEdge,
    deleteSection,
    deleteSelected,
    duplicateNode,
    duplicateSection,
    edges,
    exportPipelineTemplateForSection,
    exportProjectSnapshot,
    historyFutureLength,
    historyPastLength,
    importPipelineTemplateAt,
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
    renameNode,
    resizeSection,
    selectNode,
    selectSection,
    selectedSet,
    selectedSectionSet,
    selectNodesInRect,
    setNodeUiState,
    setProjectUiViewport,
    setSectionColor,
    sections,
    toggleSectionLock,
    toggleNodeLock,
    uiState,
    undo,
    updateNodeDataSilent,
  ]);
}
