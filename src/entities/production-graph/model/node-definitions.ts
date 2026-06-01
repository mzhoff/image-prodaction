import type { GraphPort, ProductionNode, ProductionNodeType } from './types';
import { NODE_DEFINITIONS } from './node-registry';

export const NODE_PORTS: Record<ProductionNodeType, GraphPort[]> = {
  importImage: NODE_DEFINITIONS.importImage.ports,
  textPrompt: NODE_DEFINITIONS.textPrompt.ports,
  imageToText: NODE_DEFINITIONS.imageToText.ports,
  referenceComposer: NODE_DEFINITIONS.referenceComposer.ports,
  generateImage: NODE_DEFINITIONS.generateImage.ports,
  sketch: NODE_DEFINITIONS.sketch.ports,
  cropImage: NODE_DEFINITIONS.cropImage.ports,
  adjustment: NODE_DEFINITIONS.adjustment.ports,
  removeBackground: NODE_DEFINITIONS.removeBackground.ports,
  exportImage: NODE_DEFINITIONS.exportImage.ports,
  preview: NODE_DEFINITIONS.preview.ports,
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
