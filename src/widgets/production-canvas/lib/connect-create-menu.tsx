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
  sourcePortId?: string;
  targetPortId?: string;
}

export function getConnectCreateOptions(sourceKind: PortKind) {
  return addNodeMenu.flatMap((item) => {
    const targetPortId = getDefaultTargetPortId(item.type, sourceKind);
    return targetPortId ? [{ ...item, targetPortId }] : [];
  });
}

export function getConnectCreateSourceOptions(targetKind: PortKind, targetPortId?: string) {
  return addNodeMenu.flatMap((item) => {
    const sourcePortId = getDefaultSourcePortId(item.type, targetKind, targetPortId);
    return sourcePortId ? [{ ...item, sourcePortId }] : [];
  });
}

export function createConnectMenuActions(
  options: ConnectCreateOption[],
  onSelect: (option: ConnectCreateOption) => void,
): ContextMenuAction[] {
  return options.map((option) => ({
    id: `create-connect-${option.type}`,
    label: option.label,
    icon: option.icon,
    onSelect: () => onSelect(option),
  }));
}

function getDefaultTargetPortId(type: ProductionNodeType, sourceKind: PortKind) {
  const inputPorts = NODE_PORTS[type].filter((port) => port.side === 'input');
  const priority = sourceKind === 'subject'
    ? ['actors']
    : sourceKind === 'location'
    ? ['background']
    : sourceKind === 'image'
    ? ['media-0', 'media', 'image-0', 'image', 'imageCollection', 'reference', ...layerPortIds]
    : ['body', 'text', 'textCollection', 'text-0', 'prompt', ...layerPortIds, 'image'];

  return priority.find((portId) => {
    const targetPort = inputPorts.find((port) => port.id === portId);
    if (!targetPort) return false;
    if (sourceKind === 'subject' && targetPort.kind === 'reference' && targetPort.id === 'actors') return true;
    if (sourceKind === 'location' && targetPort.kind === 'reference' && targetPort.id === 'background') return true;
    if (targetPort.kind === 'reference') return sourceKind === 'text' || sourceKind === 'image' || sourceKind === 'preset';
    return targetPort.kind === sourceKind;
  });
}

function getDefaultSourcePortId(type: ProductionNodeType, targetKind: PortKind, targetPortId?: string) {
  const outputPorts = NODE_PORTS[type].filter((port) => port.side === 'output');
  const priority = targetKind === 'reference' && targetPortId === 'actors'
    ? ['subject', 'image', 'result', 'text', 'prompt']
    : targetKind === 'reference' && targetPortId === 'background'
    ? ['location', 'image', 'result', 'text', 'prompt']
    : targetKind === 'subject'
    ? ['subject']
    : targetKind === 'location'
    ? ['location']
    : targetKind === 'image'
    ? ['image', 'imageItem', 'result']
    : ['text', 'textItem', 'items', 'result', 'prompt'];

  return priority.find((portId) => {
    const sourcePort = outputPorts.find((port) => port.id === portId);
    if (!sourcePort) return false;
    if (targetKind === 'reference') {
      if (targetPortId === 'actors' && sourcePort.kind === 'subject') return true;
      if (targetPortId === 'background' && sourcePort.kind === 'location') return true;
      return sourcePort.kind === 'text' || sourcePort.kind === 'image' || sourcePort.kind === 'preset';
    }
    return sourcePort.kind === targetKind;
  });
}
