import { NODE_PORTS } from '@/entities/production-graph/model/node-definitions';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { PortKind, ProductionNodeType } from '@/entities/production-graph/model/types';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import type { ReactNode } from 'react';
import { addNodeMenu } from './add-node-menu';

const layerPortIds = productionLayers.map((layer) => layer.id);

export interface ConnectCreateOption {
  type: ProductionNodeType;
  label: string;
  icon: ReactNode;
  targetPortId: string;
}

export function getConnectCreateOptions(sourceKind: PortKind) {
  return addNodeMenu.flatMap((item) => {
    const targetPortId = getDefaultTargetPortId(item.type, sourceKind);
    return targetPortId ? [{ ...item, targetPortId }] : [];
  });
}

export function createConnectMenuActions(
  options: ConnectCreateOption[],
  onSelect: (option: ConnectCreateOption) => void,
): ContextMenuAction[] {
  return options.map((option) => ({
    id: `create-connect-${option.type}`,
    label: `Create ${option.label}`,
    icon: option.icon,
    onSelect: () => onSelect(option),
  }));
}

function getDefaultTargetPortId(type: ProductionNodeType, sourceKind: PortKind) {
  const inputPorts = NODE_PORTS[type].filter((port) => port.side === 'input');
  const priority = sourceKind === 'image'
    ? ['image', 'reference', ...layerPortIds]
    : ['prompt', ...layerPortIds, 'image'];

  return priority.find((portId) => {
    const targetPort = inputPorts.find((port) => port.id === portId);
    if (!targetPort) return false;
    if (targetPort.kind === 'reference') return sourceKind === 'text' || sourceKind === 'image' || sourceKind === 'preset';
    return targetPort.kind === sourceKind;
  });
}
