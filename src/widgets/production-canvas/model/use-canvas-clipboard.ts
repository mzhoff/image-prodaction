'use client';

import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GraphEdge, GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getImageFileFromDataTransfer } from '@/shared/lib/image-file';
import { readLibraryImageLink } from '@/entities/production-graph/lib/library-image-reference';
import { createId } from '@/shared/lib/id';

interface NodeClipboard {
  marker: string;
  nodes: ProductionNode[];
  edges: GraphEdge[];
}

interface UseCanvasClipboardParams {
  enabled: boolean;
  deleteSelected: () => void;
  importImageFile: (file: File, position?: GraphPoint, targetNodeId?: string) => Promise<void> | void;
  importLibraryImage: (assetId: string) => Promise<boolean>;
  lastPointerWorldRef: MutableRefObject<GraphPoint>;
  pasteNodes: (nodes: ProductionNode[], edges: GraphEdge[], position: GraphPoint) => void;
  redo: () => void;
  undo: () => void;
}

export function useCanvasClipboard({
  enabled,
  deleteSelected,
  importImageFile,
  importLibraryImage,
  lastPointerWorldRef,
  pasteNodes,
  redo,
  undo,
}: UseCanvasClipboardParams) {
  const [clipboard, setClipboard] = useState<NodeClipboard | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;
      const isMod = event.metaKey || event.ctrlKey;

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
  }, [enabled, deleteSelected, redo, undo]);

  useEffect(() => {
    if (!enabled) return;
    const handleCopy = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,[contenteditable="true"],dialog') || window.getSelection()?.toString()) return;
      const graph = useProductionGraphStore.getState();
      const selected = new Set(graph.selectedNodeIds);
      if (!selected.size || !event.clipboardData) return;
      const marker = `reverie:nodes:v1:${createId('clipboard')}`;
      event.preventDefault();
      event.clipboardData.setData('text/plain', marker);
      setClipboard({ marker, nodes: graph.nodes.filter((node) => selected.has(node.id)),
        edges: graph.edges.filter((edge) => selected.has(edge.sourceNodeId) && selected.has(edge.targetNodeId)) });
    };
    window.addEventListener('copy', handleCopy);
    return () => window.removeEventListener('copy', handleCopy);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;

      const text = event.clipboardData?.getData('text/plain') ?? '';
      const assetId = readLibraryImageLink(text, window.location.origin);
      if (assetId) {
        event.preventDefault();
        setClipboard(null);
        void importLibraryImage(assetId);
        return;
      }

      if (clipboard?.nodes.length && text === clipboard.marker) {
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
  }, [enabled, clipboard, importImageFile, importLibraryImage, lastPointerWorldRef, pasteNodes]);
}
