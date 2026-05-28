'use client';

import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GraphEdge, GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getImageFileFromDataTransfer } from '@/shared/lib/image-file';

interface NodeClipboard {
  nodes: ProductionNode[];
  edges: GraphEdge[];
}

interface UseCanvasClipboardParams {
  deleteSelected: () => void;
  importImageFile: (file: File, position?: GraphPoint, targetNodeId?: string) => Promise<void> | void;
  lastPointerWorldRef: MutableRefObject<GraphPoint>;
  pasteNodes: (nodes: ProductionNode[], edges: GraphEdge[], position: GraphPoint) => void;
  redo: () => void;
  undo: () => void;
}

export function useCanvasClipboard({
  deleteSelected,
  importImageFile,
  lastPointerWorldRef,
  pasteNodes,
  redo,
  undo,
}: UseCanvasClipboardParams) {
  const [clipboard, setClipboard] = useState<NodeClipboard | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;
      const isMod = event.metaKey || event.ctrlKey;

      if (isMod && event.code === 'KeyC') {
        const selected = new Set(useProductionGraphStore.getState().selectedNodeIds);
        if (selected.size === 0) return;
        event.preventDefault();
        setClipboard({
          nodes: useProductionGraphStore.getState().nodes.filter((node) => selected.has(node.id)),
          edges: useProductionGraphStore.getState().edges.filter((edge) => (
            selected.has(edge.sourceNodeId) && selected.has(edge.targetNodeId)
          )),
        });
        return;
      }

      if (isMod && event.code === 'KeyV') {
        if (!clipboard || clipboard.nodes.length === 0) return;
        event.preventDefault();
        pasteNodes(clipboard.nodes, clipboard.edges, lastPointerWorldRef.current);
        return;
      }

      if (isMod && event.code === 'KeyZ' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((isMod && event.code === 'KeyZ' && event.shiftKey) || (isMod && event.code === 'KeyY')) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipboard, deleteSelected, lastPointerWorldRef, pasteNodes, redo, undo]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;

      if (clipboard?.nodes.length) {
        event.preventDefault();
        pasteNodes(clipboard.nodes, clipboard.edges, lastPointerWorldRef.current);
        return;
      }

      const imageFile = getImageFileFromDataTransfer(event.clipboardData, 'clipboard-image');
      if (imageFile) {
        event.preventDefault();
        void importImageFile(imageFile);
        return;
      }

      setClipboard(null);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [clipboard, importImageFile, lastPointerWorldRef, pasteNodes]);
}
