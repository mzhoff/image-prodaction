'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getInputConnectionStatus } from '../lib/input-connection-status';
import { InputConnectionBadge } from './input-connection-badge';
import { PortButton } from './port-button';

interface EntityBuilderInputRowProps {
  countLabel: string;
  isConnected: boolean;
  kind: 'image' | 'text';
  label: string;
  nodeId: string;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portId: string;
}

export function EntityBuilderInputRow({
  countLabel,
  isConnected,
  kind,
  label,
  nodeId,
  onStartConnection,
  portId,
}: EntityBuilderInputRowProps) {
  const nodes = useProductionGraphStore((state) => state.nodes);
  const edges = useProductionGraphStore((state) => state.edges);
  const assets = useProductionGraphStore((state) => state.assets);
  return (
    <div
      className="setting-row subject-input-row"
      data-port-node-id={nodeId}
      data-port-id={portId}
      data-port-side="input"
      data-connect-row="true"
    >
      <PortButton
        nodeId={nodeId}
        portId={portId}
        side="input"
        kind={kind}
        label={label}
        className="node-port-row subject-input-row-port"
        onStartConnection={onStartConnection}
      />
      <span>{label}</span>
      {kind === 'image' ? <InputConnectionBadge status={getInputConnectionStatus(nodeId, portId, { nodes, edges, assets })} /> : <span className={`input-pill ${isConnected ? 'input-pill-connected' : 'input-pill-empty'}`}>
        {countLabel}
      </span>}
    </div>
  );
}
