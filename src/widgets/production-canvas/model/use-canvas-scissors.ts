'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { GraphPoint } from '@/entities/production-graph/model/types';
import { cutIntersectsSegment } from '../lib/cut-intersection';

type SampledEdge = { id: string; points: GraphPoint[] };
type CutDraft = { pointerId: number; points: GraphPoint[]; edges: SampledEdge[]; hits: Set<string> };

export function useCanvasScissors(active: boolean, containerRef: RefObject<HTMLDivElement | null>) {
  const deleteEdges = useProductionGraphStore((state) => state.deleteEdges);
  const draftRef = useRef<CutDraft | null>(null);
  const [preview, setPreview] = useState<{ points: GraphPoint[]; hits: Set<string> } | null>(null);
  const clear = () => { draftRef.current = null; setPreview(null); };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') { draftRef.current = null; setPreview(null); } };
    const blur = () => { draftRef.current = null; setPreview(null); };
    window.addEventListener('keydown', cancel); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', cancel); window.removeEventListener('blur', blur); };
  }, []);

  const append = (event: ReactPointerEvent) => {
    const draft = draftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    const previous = draft.points[draft.points.length - 1]!;
    if (point.x === previous.x && point.y === previous.y) return;
    for (const edge of draft.edges) {
      if (draft.hits.has(edge.id)) continue;
      if (edge.points.some((p, index) => index > 0 && cutIntersectsSegment(previous, point, edge.points[index - 1]!, p))) draft.hits.add(edge.id);
    }
    draft.points.push(point);
    setPreview({ points: [...draft.points], hits: new Set(draft.hits) });
  };
  return {
    preview: active ? preview : null,
    onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!active || event.button !== 0 || event.altKey) return;
      const target = event.target as Element;
      if (!target.closest('[data-node-id]') && target.closest('button, input, textarea, [data-canvas-ui], [data-snapshot-exclude]')) return;
      event.preventDefault(); event.stopPropagation();
      const edges: SampledEdge[] = [];
      containerRef.current?.querySelectorAll<SVGPathElement>('.edge-path[data-edge-id]').forEach((path) => {
        const matrix = path.getScreenCTM();
        if (!matrix) return;
        const length = path.getTotalLength();
        const scale = Math.hypot(matrix.a, matrix.b);
        const steps = Math.max(1, Math.min(4096, Math.ceil(length * scale / 4)));
        const points = Array.from({ length: steps + 1 }, (_, i) => {
          const p = path.getPointAtLength(length * i / steps).matrixTransform(matrix);
          return { x: p.x, y: p.y };
        });
        edges.push({ id: path.dataset.edgeId!, points });
      });
      draftRef.current = { pointerId: event.pointerId, points: [{ x: event.clientX, y: event.clientY }], edges, hits: new Set() };
      event.currentTarget.setPointerCapture(event.pointerId);
      (document.activeElement as HTMLElement | null)?.blur();
      setPreview({ points: draftRef.current.points, hits: new Set() });
    },
    onPointerMoveCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!active || !draftRef.current) return;
      event.preventDefault(); event.stopPropagation(); append(event);
    },
    onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      const draft = draftRef.current;
      if (!draft || draft.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      if (active) { append(event); if (draft.hits.size) deleteEdges([...draft.hits]); }
      clear();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
      if (active && (event.target as Element).closest('[data-node-id]')) { event.preventDefault(); event.stopPropagation(); }
    },
    onPointerCancelCapture: clear,
    onLostPointerCapture: clear,
  };
}
