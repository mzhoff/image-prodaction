'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
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
      <span className={`input-pill ${isConnected ? 'input-pill-connected' : 'input-pill-empty'}`}>
        {countLabel}
      </span>
    </div>
  );
}
