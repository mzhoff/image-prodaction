'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDocumentBackendSync } from '@/entities/document/api/use-document-backend-sync';
import { DEFAULT_PROJECT_VIEWPORT } from '@/entities/production-graph/model/project-schema';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { useStudioPipelinePublications } from '@/modules/executable-pipelines/adapters/studio/use-studio-pipeline-publications';
import { useDocumentThumbnailSync } from './use-document-thumbnail-sync';
import type { useProductionCanvasStore } from './use-production-canvas-store';

type CanvasNavigation = ReturnType<typeof useCanvasNavigation>;
type GraphModel = ReturnType<typeof useProductionCanvasStore>;

export function useProductionCanvasPersistence({ canvas, graph, projectId }: {
  canvas: CanvasNavigation;
  graph: GraphModel;
  projectId?: string;
}) {
  const didInitialFitRef = useRef(false);
  const didApplyRestoredViewportRef = useRef(false);
  const hasRestoredViewport = graph.uiState.viewport.x !== DEFAULT_PROJECT_VIEWPORT.x
    || graph.uiState.viewport.y !== DEFAULT_PROJECT_VIEWPORT.y
    || graph.uiState.viewport.zoom !== DEFAULT_PROJECT_VIEWPORT.zoom;
  const subscribeToProjectChanges = useCallback((
    listener: (change?: { thumbnailRelevant?: boolean }) => void,
  ) => useProductionGraphStore.subscribe((state, previous) => {
    const thumbnailRelevant = state.version !== previous.version
      || state.nodes !== previous.nodes || state.sections !== previous.sections
      || state.edges !== previous.edges || state.assets !== previous.assets
      || state.presets !== previous.presets || state.subjects !== previous.subjects
      || state.locations !== previous.locations || state.publications !== previous.publications
      || state.runs !== previous.runs || state.uiState.nodes !== previous.uiState.nodes
      || state.uiState.sections !== previous.uiState.sections;
    if (thumbnailRelevant || state.uiState !== previous.uiState) {
      listener({ thumbnailRelevant });
    }
  }), []);
  const documentSync = useDocumentBackendSync({
    exportSnapshot: graph.exportProjectSnapshot,
    importSnapshot: graph.importPortableProject,
    projectId,
    resetProject: graph.resetProject,
    subscribeToProjectChanges,
  });
  const documentThumbnail = useDocumentThumbnailSync({
    canvasRef: canvas.containerRef,
    projectId,
    saveSequence: documentSync.saveSequence,
    serverMode: documentSync.thumbnailMode,
    workspaceId: documentSync.workspaceId,
  });
  const studioPipelines = useStudioPipelinePublications({
    exportSnapshot: graph.exportProjectSnapshot,
    projectId,
  });

  useEffect(() => {
    if (!hasRestoredViewport || didApplyRestoredViewportRef.current) return;
    didApplyRestoredViewportRef.current = true;
    canvas.setPan({ x: graph.uiState.viewport.x, y: graph.uiState.viewport.y });
    canvas.setZoom(graph.uiState.viewport.zoom);
  }, [canvas, graph.uiState.viewport.x, graph.uiState.viewport.y,
    graph.uiState.viewport.zoom, hasRestoredViewport]);
  useEffect(() => {
    if (hasRestoredViewport || didInitialFitRef.current || graph.nodes.length === 0) return;
    didInitialFitRef.current = true;
    window.requestAnimationFrame(() => canvas.zoomToBounds(graph.bounds, 64));
  }, [canvas, graph.bounds, graph.nodes.length, hasRestoredViewport]);
  useEffect(() => {
    const viewport = { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom };
    const timeoutId = window.setTimeout(() => graph.setProjectUiViewport(viewport), 150);
    return () => window.clearTimeout(timeoutId);
  }, [canvas.pan.x, canvas.pan.y, canvas.zoom, graph]);

  return { documentSync, documentThumbnail, studioPipelines };
}
