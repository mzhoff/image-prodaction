'use client';

import { useMemo } from 'react';
import { normalizeNodeDisplayState } from '@/entities/production-graph/model/project-schema';
import type { useCanvasNavigation } from '@/shared/ui/use-canvas-navigation';
import { usePortPointMeasurement } from './use-port-point-measurement';
import type { useProductionCanvasStore } from './use-production-canvas-store';

type CanvasNavigation = ReturnType<typeof useCanvasNavigation>;
type GraphModel = ReturnType<typeof useProductionCanvasStore>;

export function useProductionCanvasMeasurements(graph: GraphModel, canvas: CanvasNavigation) {
  const collapsedGenerateComposingNodeIds = useMemo(() => new Set(
    graph.nodes.filter((node) => node.type === 'generateImage'
      && normalizeNodeDisplayState(graph.uiState.nodes[node.id]) === 'Collapsed')
      .map((node) => node.id),
  ), [graph.nodes, graph.uiState.nodes]);
  const measuredPortPoints = usePortPointMeasurement({
    collapsedGenerateComposingNodeIds,
    containerRef: canvas.containerRef,
    edges: graph.edges,
    nodes: graph.nodes,
    pan: canvas.pan,
    zoom: canvas.zoom,
  });
  return { collapsedGenerateComposingNodeIds, measuredPortPoints };
}
