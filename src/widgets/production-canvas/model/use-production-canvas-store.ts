'use client';

import { useMemo } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getNodeBounds } from '../lib/edge-path';

export function useProductionCanvasStore() {
  const nodes = useProductionGraphStore((state) => state.nodes);
  const edges = useProductionGraphStore((state) => state.edges);
  const selectedNodeIds = useProductionGraphStore((state) => state.selectedNodeIds);
  const addNode = useProductionGraphStore((state) => state.addNode);
  const connect = useProductionGraphStore((state) => state.connect);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const deleteSelected = useProductionGraphStore((state) => state.deleteSelected);
  const historyPastLength = useProductionGraphStore((state) => state.historyPast.length);
  const historyFutureLength = useProductionGraphStore((state) => state.historyFuture.length);
  const moveNode = useProductionGraphStore((state) => state.moveNode);
  const moveSelectedNodesBy = useProductionGraphStore((state) => state.moveSelectedNodesBy);
  const pasteImageAsset = useProductionGraphStore((state) => state.pasteImageAsset);
  const pasteNodes = useProductionGraphStore((state) => state.pasteNodes);
  const pushHistory = useProductionGraphStore((state) => state.pushHistory);
  const redo = useProductionGraphStore((state) => state.redo);
  const resetProject = useProductionGraphStore((state) => state.resetProject);
  const selectNode = useProductionGraphStore((state) => state.selectNode);
  const selectNodesInRect = useProductionGraphStore((state) => state.selectNodesInRect);
  const undo = useProductionGraphStore((state) => state.undo);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const bounds = useMemo(() => getNodeBounds(nodes), [nodes]);

  return useMemo(() => ({
    addNode,
    bounds,
    connect,
    deleteEdge,
    deleteSelected,
    edges,
    historyFutureLength,
    historyPastLength,
    moveNode,
    moveSelectedNodesBy,
    nodes,
    nodesById,
    pasteImageAsset,
    pasteNodes,
    pushHistory,
    redo,
    resetProject,
    selectNode,
    selectedSet,
    selectNodesInRect,
    undo,
  }), [
    addNode,
    bounds,
    connect,
    deleteEdge,
    deleteSelected,
    edges,
    historyFutureLength,
    historyPastLength,
    moveNode,
    moveSelectedNodesBy,
    nodes,
    nodesById,
    pasteImageAsset,
    pasteNodes,
    pushHistory,
    redo,
    resetProject,
    selectNode,
    selectedSet,
    selectNodesInRect,
    undo,
  ]);
}
