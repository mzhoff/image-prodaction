'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useNodeTemplatePresets } from '@/entities/production-graph/api/use-node-template-presets';
import { hydrateNodeTemplateAssets } from '@/entities/production-graph/api/node-template-assets';
import type { GraphPoint } from '@/entities/production-graph/model/types';
import type { useProductionCanvasStore } from './use-production-canvas-store';

type GraphModel = ReturnType<typeof useProductionCanvasStore>;

export function useCanvasNodeTemplates({ closeContextMenu, getPalettePosition,
  graph, projectId, showToast, workspaceId }: {
  closeContextMenu: () => void;
  getPalettePosition: () => GraphPoint;
  graph: GraphModel;
  projectId?: string;
  showToast: (message: string) => void;
  workspaceId?: string;
}) {
  const nodeTemplates = useNodeTemplatePresets(workspaceId);
  const pendingRequests = useRef(new Set<AbortController>());
  useEffect(() => {
    const requests = pendingRequests.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, [workspaceId, projectId]);
  const createTemplateNode = useCallback(async (templateId: string, position: GraphPoint) => {
    const template = nodeTemplates.templates.find((item) => item.id === templateId);
    if (!template || !workspaceId || template.workspaceId !== workspaceId) {
      showToast('Template is no longer available.');
      return null;
    }
    const controller = new AbortController();
    pendingRequests.current.add(controller);
    try {
      const hydrated = await hydrateNodeTemplateAssets(template.snapshot, workspaceId, controller.signal);
      if (controller.signal.aborted) return null;
      const nodeId = graph.addNodeFromFavorite(hydrated.snapshot, position, hydrated.assets);
      if (template.snapshot.nodeType === 'generateImage') graph.setNodeUiState(nodeId, { state: 'Collapsed' });
      if (hydrated.strippedAssetReferenceCount) showToast('Template added without unavailable images.');
      return nodeId;
    } catch (error) {
      if (!controller.signal.aborted) showToast(error instanceof Error ? error.message : 'Could not load template images.');
      return null;
    } finally {
      pendingRequests.current.delete(controller);
    }
  }, [graph, nodeTemplates.templates, showToast, workspaceId]);
  const createTemplateNodeFromPalette = useCallback((templateId: string) => {
    void createTemplateNode(templateId, getPalettePosition());
    closeContextMenu();
  }, [closeContextMenu, createTemplateNode, getPalettePosition]);

  return { ...nodeTemplates, createTemplateNode, createTemplateNodeFromPalette };
}
