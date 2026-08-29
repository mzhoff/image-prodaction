'use client';

import { useEffect } from 'react';
import type { Dispatch, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent,
  RefObject, SetStateAction } from 'react';
import type { GraphPoint, ProductionNode,
  ProductionNodeType } from '@/entities/production-graph/model/types';
import { getImageFilesFromDataTransfer,
  hasImageFileInDataTransfer } from '@/shared/lib/image-file';
import type { useCanvasBoxSelection } from '@/shared/ui/use-canvas-box-selection';
import type { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import type { useSectionDrawing } from './use-section-drawing';
import type { CanvasTool } from './production-canvas-values';
import { getDraggedFavoriteNodeId, getDraggedNodeType,
  hasDraggedFavoriteNode, hasDraggedNodeType } from './production-canvas-values';

type CanvasNavigation = ReturnType<typeof useCanvasNavigation>;
type BoxSelection = ReturnType<typeof useCanvasBoxSelection>;
type SectionDrawing = ReturnType<typeof useSectionDrawing>;

interface CanvasInteractionOptions {
  boxSelection: BoxSelection;
  canvas: CanvasNavigation;
  canvasTool: CanvasTool;
  closeContextMenu: () => void;
  createNode: (type: ProductionNodeType, position: GraphPoint) => string;
  createFavoriteNode: (favoriteId: string, position: GraphPoint) => string | null;
  getFallbackPastePosition: () => GraphPoint;
  importImageFiles: (
    files: readonly File[],
    position?: GraphPoint,
    targetNodeId?: string,
  ) => Promise<void>;
  lastPointerWorldRef: RefObject<GraphPoint>;
  nodesById: Map<string, ProductionNode>;
  sectionDrawing: SectionDrawing;
  setCanvasTool: Dispatch<SetStateAction<CanvasTool>>;
  showToast: (message: string) => void;
  toggleCollapsedStateForSelectedNodes: () => void;
}

export function useProductionCanvasInteractions(options: CanvasInteractionOptions) {
  const { boxSelection, canvas, canvasTool, closeContextMenu, createFavoriteNode, createNode,
    getFallbackPastePosition, importImageFiles, lastPointerWorldRef, nodesById,
    sectionDrawing, setCanvasTool, showToast,
    toggleCollapsedStateForSelectedNodes } = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
        || target?.isContentEditable;
      if (isTyping || target?.closest('.image-viewer-overlay')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        if (event.shiftKey && event.code === 'KeyH') {
          event.preventDefault(); toggleCollapsedStateForSelectedNodes();
        }
        return;
      }
      if (event.shiftKey && event.code === 'KeyS') {
        event.preventDefault(); setCanvasTool('section'); closeContextMenu(); return;
      }
      if (!event.shiftKey && event.code === 'KeyV') {
        event.preventDefault(); setCanvasTool('select'); closeContextMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeContextMenu, setCanvasTool, toggleCollapsedStateForSelectedNodes]);

  const handleCanvasMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-node-id]')
      || target.closest('button, input, [data-canvas-ui]')) return;
    if (event.shiftKey && target.closest('[data-canvas-section]')) return;
    closeContextMenu();
    if (canvasTool === 'section') sectionDrawing.startSectionDrawing(event);
    else boxSelection.startSelection(event);
  };
  const handleCanvasMouseMove = (event: ReactMouseEvent) => {
    const worldPoint = canvas.screenToWorld(event.nativeEvent);
    if (worldPoint) lastPointerWorldRef.current = worldPoint;
  };
  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedNodeType(event.dataTransfer)
      && !hasDraggedFavoriteNode(event.dataTransfer)
      && !hasImageFileInDataTransfer(event.dataTransfer)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  };
  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const favoriteId = getDraggedFavoriteNodeId(event.dataTransfer);
    if (favoriteId) {
      event.preventDefault(); event.stopPropagation(); closeContextMenu();
      createFavoriteNode(
        favoriteId,
        canvas.screenToWorld(event.nativeEvent) ?? getFallbackPastePosition(),
      );
      return;
    }
    const draggedNodeType = getDraggedNodeType(event.dataTransfer);
    if (draggedNodeType) {
      event.preventDefault(); event.stopPropagation(); closeContextMenu();
      createNode(draggedNodeType,
        canvas.screenToWorld(event.nativeEvent) ?? getFallbackPastePosition());
      return;
    }
    const imageFiles = getImageFilesFromDataTransfer(event.dataTransfer, 'dropped-image');
    if (imageFiles.length === 0) return;
    event.preventDefault(); event.stopPropagation(); closeContextMenu();
    const dropPoint = canvas.screenToWorld(event.nativeEvent) ?? getFallbackPastePosition();
    const targetNodeId = getDropTargetImportNodeId(event, nodesById);
    void importImageFiles(imageFiles, dropPoint, targetNodeId).then(() => {
      if (imageFiles.length > 1) showToast(`${imageFiles.length} images imported.`);
    });
  };
  const cursor = canvas.isPanning || sectionDrawing.isDrawingSection
    ? canvas.isPanning ? 'grabbing' : 'crosshair'
    : canvasTool === 'section' || boxSelection.isSelecting ? 'crosshair' : undefined;
  return { cursor, handleCanvasDragOver, handleCanvasDrop,
    handleCanvasMouseDown, handleCanvasMouseMove };
}

function getDropTargetImportNodeId(
  event: ReactDragEvent<HTMLElement>,
  nodesById: Map<string, ProductionNode>,
) {
  const target = event.target instanceof Element ? event.target : null;
  const nodeId = target?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
  const node = nodeId ? nodesById.get(nodeId) : undefined;
  return node?.type === 'importImage' ? node.id : undefined;
}
