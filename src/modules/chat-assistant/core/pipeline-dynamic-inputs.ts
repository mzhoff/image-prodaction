import {
  COMPOSITION_LAYER_MAX_INPUTS,
  getCompositionLayerPortIndex,
  getExportImageInputPortIndex,
  getTextConcatInputPortIndex,
} from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, ProductionNodeData } from '@/entities/production-graph/model/types';

export function expandDynamicInputPorts(node: ProductionNode, portId: string) {
  if (node.type === 'textConcat') {
    expandTextConcatInputPorts(node, portId);
    return;
  }
  if (node.type === 'composition') {
    const portIndex = getCompositionLayerPortIndex(portId);
    if (portIndex < 0 || portIndex >= COMPOSITION_LAYER_MAX_INPUTS) return;
    const data = node.data as ProductionNodeData & { layerInputCount?: number };
    const currentCount = Number(data.layerInputCount) || 2;
    node.data = { ...node.data, layerInputCount: Math.max(2, currentCount, portIndex + 1) };
    return;
  }
  if (node.type === 'exportImage') {
    const portIndex = getExportImageInputPortIndex(portId);
    if (portIndex < 0 || portIndex >= 10) return;
    const data = node.data as ProductionNodeData & { imageInputCount?: number };
    const currentCount = Number(data.imageInputCount) || 1;
    node.data = { ...node.data, imageInputCount: Math.max(1, currentCount, portIndex + 1) };
  }
}

export function expandTextConcatInputPorts(node: ProductionNode, portId: string) {
  if (node.type !== 'textConcat') return;
  const portIndex = getTextConcatInputPortIndex(portId);
  if (portIndex < 0 || portIndex >= 12) return;
  const data = node.data as ProductionNodeData & { inputCount?: number };
  const currentCount = Number(data.inputCount) || 2;
  node.data = { ...node.data, inputCount: Math.max(2, currentCount, portIndex + 1) };
}
