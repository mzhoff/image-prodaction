import type { GraphPort, ProductionNode, ProductionNodeType } from './types';
import { productionLayers } from './production-layers';

const layerPresetInputPorts = productionLayers.map((layer) => ({
  id: layer.id,
  label: layer.label,
  kind: 'preset' as const,
  side: 'input' as const,
})) satisfies GraphPort[];

const layerReferenceInputPorts = productionLayers.map((layer) => ({
  id: layer.id,
  label: layer.label,
  kind: 'reference' as const,
  side: 'input' as const,
})) satisfies GraphPort[];

export const NODE_PORTS: Record<ProductionNodeType, GraphPort[]> = {
  importImage: [
    { id: 'image', label: 'Image', kind: 'image', side: 'output' },
  ],
  textPrompt: [
    { id: 'text', label: 'Text', kind: 'text', side: 'output' },
  ],
  imageToText: [
    { id: 'image', label: 'Image', kind: 'image', side: 'input' },
    { id: 'result', label: 'Result', kind: 'text', side: 'output' },
  ],
  referenceComposer: [
    ...layerPresetInputPorts,
    { id: 'prompt', label: 'Prompt', kind: 'text', side: 'output' },
  ],
  generateImage: [
    { id: 'prompt', label: 'Prompt', kind: 'text', side: 'input' },
    { id: 'reference', label: 'Reference', kind: 'image', side: 'input' },
    ...layerReferenceInputPorts,
    { id: 'image', label: 'Image', kind: 'image', side: 'output' },
  ],
  exportImage: [
    { id: 'image', label: 'Image', kind: 'image', side: 'input' },
  ],
  preview: [
    { id: 'image', label: 'Image', kind: 'image', side: 'input' },
  ],
};

export function getNodePorts(node: ProductionNode) {
  return NODE_PORTS[node.type];
}

export function getPortById(node: ProductionNode, portId: string) {
  return getNodePorts(node).find((port) => port.id === portId);
}

export function canConnectPorts(source: ProductionNode, sourcePortId: string, target: ProductionNode, targetPortId: string) {
  if (source.id === target.id) return false;

  const sourcePort = getPortById(source, sourcePortId);
  const targetPort = getPortById(target, targetPortId);
  if (!sourcePort || !targetPort) return false;
  if (sourcePort.side !== 'output' || targetPort.side !== 'input') return false;
  if (targetPort.kind === 'reference') {
    return sourcePort.kind === 'text' || sourcePort.kind === 'image' || sourcePort.kind === 'preset';
  }

  return sourcePort.kind === targetPort.kind;
}
