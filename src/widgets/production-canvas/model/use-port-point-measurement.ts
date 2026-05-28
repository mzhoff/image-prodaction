'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { GraphEdge, GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import type { PortPointLookup } from '../lib/edge-path';
import { getPortPointKey } from '../lib/edge-path';
import { arePortPointLookupsEqual } from '../lib/port-points';

interface UsePortPointMeasurementParams {
  collapsedGenerateComposingNodeIds: Set<string>;
  containerRef: RefObject<HTMLDivElement | null>;
  edges: GraphEdge[];
  nodes: ProductionNode[];
  pan: GraphPoint;
  zoom: number;
}

export function usePortPointMeasurement({
  collapsedGenerateComposingNodeIds,
  containerRef,
  edges,
  nodes,
  pan,
  zoom,
}: UsePortPointMeasurementParams) {
  const [measuredPortPoints, setMeasuredPortPoints] = useState<PortPointLookup>({});

  const measurePortPoints = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvasRect = container.getBoundingClientRect();
    const next: PortPointLookup = {};
    const portElements = container.querySelectorAll<HTMLElement>('[data-port-node-id][data-port-id]');
    portElements.forEach((element) => {
      const nodeId = element.dataset.portNodeId;
      const portId = element.dataset.portId;
      if (!nodeId || !portId) return;

      const rect = element.getBoundingClientRect();
      next[getPortPointKey(nodeId, portId)] = {
        x: (rect.left + rect.width / 2 - canvasRect.left - pan.x) / zoom,
        y: (rect.top + rect.height / 2 - canvasRect.top - pan.y) / zoom,
      };
    });

    setMeasuredPortPoints((current) => (arePortPointLookupsEqual(current, next) ? current : next));
  }, [containerRef, pan.x, pan.y, zoom]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(measurePortPoints);
    return () => window.cancelAnimationFrame(frame);
  }, [collapsedGenerateComposingNodeIds, edges, measurePortPoints, nodes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let frame = 0;
    const scheduleMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measurePortPoints);
    };

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    container.querySelectorAll('[data-node-id]').forEach((element) => observer.observe(element));
    scheduleMeasure();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [collapsedGenerateComposingNodeIds, containerRef, measurePortPoints, nodes.length]);

  return measuredPortPoints;
}
