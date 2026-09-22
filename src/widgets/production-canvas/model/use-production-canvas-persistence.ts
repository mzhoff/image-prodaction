'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDocumentBackendSync } from '@/entities/document/api/use-document-backend-sync';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport } from '@/entities/production-graph/model/project-schema';
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
  const exportDocumentSnapshot = useProductionGraphStore((state) => state.exportDocumentSnapshot);
  const restoreDocumentSnapshot = useProductionGraphStore((state) => state.restoreDocumentSnapshot);
  // Opening a new document is not an undoable "clear canvas" action.
  const restoreEmptyDocument = useCallback(() => restoreDocumentSnapshot(createProjectExport(initialProject, createEmptyProjectUiState())), [restoreDocumentSnapshot]);
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
    exportSnapshot: exportDocumentSnapshot,
    importSnapshot: restoreDocumentSnapshot,
    projectId,
    resetProject: restoreEmptyDocument,
    subscribeToProjectChanges,
  });
  const documentThumbnail = useDocumentThumbnailSync({
    canvasRef: canvas.containerRef,
    projectId,
    prepareExit: documentSync.prepareExit,
    serverMode: documentSync.thumbnailMode,
    workspaceId: documentSync.workspaceId,
  });
  const studioPipelines = useStudioPipelinePublications({
    exportSnapshot: graph.exportProjectSnapshot,
    projectId,
  });
  const documentPhase = documentSync.syncState.phase;
  const zoomToBounds = canvas.zoomToBounds;
  const setProjectUiViewport = graph.setProjectUiViewport;

  useEffect(() => {
    if (documentPhase === 'loading') {
      didInitialFitRef.current = false;
      return undefined;
    }
    const documentReady = !projectId
      || documentPhase === 'saved'
      || documentPhase === 'recovery';
    const hasCanvasContent = graph.nodes.length > 0 || graph.sections.length > 0;
    if (!documentReady || !hasCanvasContent || didInitialFitRef.current) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      didInitialFitRef.current = true;
      zoomToBounds(graph.bounds);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [documentPhase, graph.bounds, graph.nodes.length,
    graph.sections.length, projectId, zoomToBounds]);
  useEffect(() => {
    if (!documentSync.documentReady) return;
    const viewport = { x: canvas.pan.x, y: canvas.pan.y, zoom: canvas.zoom };
    const timeoutId = window.setTimeout(() => setProjectUiViewport(viewport), 150);
    return () => window.clearTimeout(timeoutId);
  }, [canvas.pan.x, canvas.pan.y, canvas.zoom, documentSync.documentReady, setProjectUiViewport]);

  return { documentSync, documentThumbnail, studioPipelines };
}
