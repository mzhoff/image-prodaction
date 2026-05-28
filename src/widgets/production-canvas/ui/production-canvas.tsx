'use client';

import { Copy, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { NodeCard } from '@/features/graph-node/ui/node-card';
import { hasFileInDataTransfer, hasImageFileInDataTransfer, getImageFileFromDataTransfer } from '@/shared/lib/image-file';
import { ContextMenu } from '@/shared/ui/context-menu';
import { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { getBezierPath, getEdgePath, getNodeBounds } from '../lib/edge-path';
import { getEdgeDataKind } from '../lib/edge-kind';
import { useCanvasClipboard } from '../model/use-canvas-clipboard';
import { useCanvasImageImport } from '../model/use-canvas-image-import';
import { useConnectionDraft } from '../model/use-connection-draft';
import { useNodeDrag } from '../model/use-node-drag';
import { usePortPointMeasurement } from '../model/use-port-point-measurement';
import { addNodeMenu } from './add-node-menu';
import { CanvasGrid } from './canvas-grid';
import { CanvasToolbar } from './canvas-toolbar';
import { OpenRouterBalance } from './openrouter-balance';

const worldSize = 4000;

export function ProductionCanvas() {
  const canvas = useCanvasNavigation();
  const contextMenu = useContextMenu();
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
  const [collapsedGenerateComposingNodeIds, setCollapsedGenerateComposingNodeIds] = useState<Set<string>>(() => new Set());
  const didInitialFitRef = useRef(false);
  const lastPointerWorldRef = useRef({ x: 0, y: 0 });
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const bounds = useMemo(() => getNodeBounds(nodes), [nodes]);
  const boxSelection = useCanvasBoxSelection({ screenToWorld: canvas.screenToWorld, onSelect: selectNodesInRect });
  const measuredPortPoints = usePortPointMeasurement({
    collapsedGenerateComposingNodeIds,
    containerRef: canvas.containerRef,
    edges,
    nodes,
    pan: canvas.pan,
    zoom: canvas.zoom,
  });

  useEffect(() => {
    if (didInitialFitRef.current || nodes.length === 0) return;
    didInitialFitRef.current = true;
    window.requestAnimationFrame(() => canvas.zoomToBounds(bounds, 64));
  }, [bounds, canvas, nodes.length]);

  const getFallbackPastePosition = useCallback(() => {
    const container = canvas.containerRef.current;
    if (!container) return lastPointerWorldRef.current;

    const rect = container.getBoundingClientRect();
    const centerPoint = canvas.screenToWorld({
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    return centerPoint ?? lastPointerWorldRef.current;
  }, [canvas]);

  const importImageFile = useCanvasImageImport({ getFallbackPastePosition, pasteImageAsset });
  useCanvasClipboard({ deleteSelected, importImageFile, lastPointerWorldRef, pasteNodes, redo, undo });

  const startNodeDrag = useNodeDrag({
    closeContextMenu: contextMenu.closeContextMenu,
    moveNode,
    moveSelectedNodesBy,
    pushHistory,
    screenToWorld: canvas.screenToWorld,
    selectNode,
    selectedSet,
  });
  const { connectionDraft, startConnection } = useConnectionDraft({
    connect,
    deleteEdge,
    edges,
    measuredPortPoints,
    nodesById,
    screenToWorld: canvas.screenToWorld,
  });

  const openCanvasMenu = useCallback((event: ReactMouseEvent) => {
    const worldPoint = canvas.screenToWorld(event.nativeEvent) ?? { x: 0, y: 0 };
    contextMenu.openContextMenu(event, [
      ...addNodeMenu.map((item) => ({
        id: `add-${item.type}`,
        label: item.label,
        icon: item.icon,
        onSelect: () => addNode(item.type, worldPoint),
      })),
      {
        id: 'zoom-to-fit',
        label: 'Zoom to fit',
        icon: <Maximize2 size={14} />,
        separatorBefore: true,
        onSelect: () => canvas.zoomToBounds(bounds),
      },
      {
        id: 'reset-project',
        label: 'Reset local graph',
        icon: <RotateCcw size={14} />,
        separatorBefore: true,
        destructive: true,
        onSelect: resetProject,
      },
    ]);
  }, [addNode, bounds, canvas, contextMenu, resetProject]);

  const openNodeMenu = useCallback((node: ProductionNode, event: ReactMouseEvent) => {
    selectNode(node.id);
    contextMenu.openContextMenu(event, [
      { id: 'copy-node', label: 'Duplicate node', icon: <Copy size={14} />, disabled: true, onSelect: () => undefined },
      {
        id: 'delete-node',
        label: 'Delete selected',
        icon: <Trash2 size={14} />,
        destructive: true,
        separatorBefore: true,
        onSelect: deleteSelected,
      },
    ]);
  }, [contextMenu, deleteSelected, selectNode]);

  const handleCanvasMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-node-id]') || target.closest('button')) return;
    contextMenu.closeContextMenu();
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
    contextMenu.closeContextMenu();

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

  return (
    <div className="canvas-shell">
      <CanvasToolbar
        canRedo={historyFutureLength > 0}
        canUndo={historyPastLength > 0}
        onDeleteSelected={deleteSelected}
        onRedo={redo}
        onUndo={undo}
        onZoomToFit={() => canvas.zoomToBounds(bounds)}
      />
      <div
        ref={canvas.containerRef}
        className="production-canvas"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        onContextMenu={openCanvasMenu}
        style={{ cursor: canvas.isPanning ? 'grabbing' : boxSelection.isSelecting ? 'crosshair' : undefined }}
      >
        <CanvasGrid pan={canvas.pan} zoom={canvas.zoom} />
        <div className="canvas-world" style={{ width: worldSize, height: worldSize, transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.zoom})` }}>
          <svg className="edge-layer" width={worldSize} height={worldSize} aria-hidden="true">
            {edges.map((edge) => {
              const path = getEdgePath(edge, nodesById, { collapsedGenerateComposingNodeIds, measuredPortPoints });
              if (!path) return null;
              const edgeDataKind = getEdgeDataKind(edge, nodesById);
              return <path key={edge.id} d={path} className={`edge-path ${edgeDataKind === 'text' ? 'edge-path-text' : 'edge-path-image'}`} />;
            })}
            {connectionDraft ? <path d={getBezierPath(connectionDraft.start, connectionDraft.current)} className="edge-path edge-path-draft" /> : null}
          </svg>
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedSet.has(node.id)}
              faded={selectedSet.size > 0 && !selectedSet.has(node.id)}
              onStartDrag={startNodeDrag}
              onStartConnection={startConnection}
              onContextMenu={openNodeMenu}
              generateComposingOpen={!collapsedGenerateComposingNodeIds.has(node.id)}
              onGenerateComposingOpenChange={(open) => toggleGenerateComposing(node.id, open)}
            />
          ))}
        </div>
        <div className="zoom-indicator">{Math.round(canvas.zoom * 100)}%</div>
        <OpenRouterBalance />
        {boxSelection.rectStyle ? <div className="selection-rect" style={boxSelection.rectStyle} /> : null}
        <ContextMenu menu={contextMenu.menu} onClose={contextMenu.closeContextMenu} />
      </div>
    </div>
  );
}
