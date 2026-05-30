'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';

interface PortButtonProps {
  nodeId: string;
  portId: string;
  side: 'input' | 'output';
  kind: string;
  label: string;
  className?: string;
  connectionState?: 'empty' | 'text' | 'image' | 'mixed';
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function PortButton({
  nodeId,
  portId,
  side,
  kind,
  label,
  className,
  connectionState,
  onStartConnection,
}: PortButtonProps) {
  return (
    <button
      type="button"
      className={cn('node-port', `node-port-${side}`, `node-port-${kind}`, connectionState && `node-port-state-${connectionState}`, className)}
      data-port-node-id={nodeId}
      data-port-id={portId}
      data-port-side={side}
      aria-label={`${label} ${side}`}
      title={`${label} (${kind})`}
      onPointerDown={(event) => {
        onStartConnection(nodeId, portId, event);
      }}
    />
  );
}

export function getPortTop(node: ProductionNode, side: 'input' | 'output', index: number) {
  if (node.type === 'referenceComposer' && side === 'input') return 304 + index * 38;
  if (node.type === 'generateImage' && side === 'input') return 610 + index * 39;
  if (node.type === 'generateImage' && side === 'output') return 127;
  if (node.type === 'imageToText' && side === 'input') return 74;
  if (node.type === 'imageToText' && side === 'output') return 402;
  if (node.type === 'exportImage' && side === 'input') return 126;
  if (node.type === 'preview' && side === 'input') return 52;
  if (node.type === 'importImage' && side === 'output') return 132;
  return Math.max(52, 120 + index * 54);
}
