'use client';

import { X } from '@prodactionpro/ui-core/icons';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';
import type { InputConnectionStatus } from '../lib/input-connection-status';

export function InputConnectionBadge({ status }: { status: InputConnectionStatus }) {
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  if (status.sourceLabels?.length) return <span className="input-source-badges">
    {status.sourceLabels.map((label, index) => {
      const edgeId = status.sourceEdgeIds?.[index];
      return <span key={edgeId ?? `${index}:${label}`} className={cn('input-pill', 'input-pill-reference', `input-pill-${status.state}`)} title={label}>
        <span className="input-reference-label">{label}</span>
        {edgeId ? <button type="button" className="input-reference-remove" aria-label={`Disconnect ${label}`} title="Disconnect"
          data-node-interactive onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); deleteEdge(edgeId); }}><X size={12} /></button> : null}
      </span>;
    })}
  </span>;
  return <span
    className={cn('input-pill', `input-pill-${status.state}`, `input-pill-data-${status.kind}`)}
    title={status.label}
  >{status.label}</span>;
}
