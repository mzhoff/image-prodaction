import type { GraphPort, ProductionNode, ProductionNodeType, TelegramPublicationNodeData, TextConcatNodeData, TextPromptNodeData, TextSplitterNodeData } from './types';
import { NODE_DEFINITIONS } from './node-registry';

export const NODE_PORTS: Record<ProductionNodeType, GraphPort[]> = {
  importImage: NODE_DEFINITIONS.importImage.ports,
  textPrompt: NODE_DEFINITIONS.textPrompt.ports,
  textConcat: NODE_DEFINITIONS.textConcat.ports,
  textGeneration: NODE_DEFINITIONS.textGeneration.ports,
  textSplitter: NODE_DEFINITIONS.textSplitter.ports,
  iterator: NODE_DEFINITIONS.iterator.ports,
  subjectBuilder: NODE_DEFINITIONS.subjectBuilder.ports,
  locationBuilder: NODE_DEFINITIONS.locationBuilder.ports,
  telegramPublication: NODE_DEFINITIONS.telegramPublication.ports,
  imageToText: NODE_DEFINITIONS.imageToText.ports,
  referenceComposer: NODE_DEFINITIONS.referenceComposer.ports,
  generateImage: NODE_DEFINITIONS.generateImage.ports,
  sketch: NODE_DEFINITIONS.sketch.ports,
  cropImage: NODE_DEFINITIONS.cropImage.ports,
  adjustment: NODE_DEFINITIONS.adjustment.ports,
  curves: NODE_DEFINITIONS.curves.ports,
  frequencyRetouch: NODE_DEFINITIONS.frequencyRetouch.ports,
  refineImage: NODE_DEFINITIONS.refineImage.ports,
  removeBackground: NODE_DEFINITIONS.removeBackground.ports,
  exportImage: NODE_DEFINITIONS.exportImage.ports,
  preview: NODE_DEFINITIONS.preview.ports,
};

export function getNodePorts(node: ProductionNode) {
  if (node.type === 'textPrompt') return getTextPromptPorts(node);
  if (node.type === 'textConcat') return getTextConcatPorts(node);
  if (node.type === 'textSplitter') return getTextSplitterPorts(node);
  if (node.type === 'telegramPublication') return getTelegramPublicationPorts(node);
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
    if (sourcePort.kind === 'subject') return targetPort.id === 'actors';
    if (sourcePort.kind === 'location') return targetPort.id === 'background';
    return sourcePort.kind === 'text' || sourcePort.kind === 'image' || sourcePort.kind === 'preset';
  }

  return sourcePort.kind === targetPort.kind;
}

export const TEXT_CONCAT_MIN_INPUTS = 2;
export const TEXT_CONCAT_PORT_PREFIX = 'text-';
export const TEXT_PROMPT_VARIABLE_MAX_INPUTS = 10;
export const TEXT_PROMPT_VARIABLE_PORT_PREFIX = 'variable-';
export const TELEGRAM_MEDIA_MAX_INPUTS = 10;
export const TELEGRAM_MEDIA_MIN_INPUTS = 1;
export const TELEGRAM_MEDIA_PORT_PREFIX = 'media-';
export const TEXT_SPLITTER_MAX_ITEMS = 30;
export const TEXT_SPLITTER_PORT_PREFIX = 'item-';

export function getTextConcatInputPortId(index: number) {
  return `${TEXT_CONCAT_PORT_PREFIX}${index}`;
}

export function getTextConcatInputPortIndex(portId: string) {
  if (!portId.startsWith(TEXT_CONCAT_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(TEXT_CONCAT_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getTextPromptVariablePortId(index: number) {
  return `${TEXT_PROMPT_VARIABLE_PORT_PREFIX}${index}`;
}

export function getTextPromptVariablePortIndex(portId: string) {
  if (!portId.startsWith(TEXT_PROMPT_VARIABLE_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(TEXT_PROMPT_VARIABLE_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getTelegramMediaInputPortId(index: number) {
  return `${TELEGRAM_MEDIA_PORT_PREFIX}${index}`;
}

export function getTelegramMediaInputPortIndex(portId: string) {
  if (!portId.startsWith(TELEGRAM_MEDIA_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(TELEGRAM_MEDIA_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getTextSplitterItemPortId(index: number) {
  return `${TEXT_SPLITTER_PORT_PREFIX}${index}`;
}

export function getTextSplitterItemPortIndex(portId: string) {
  if (!portId.startsWith(TEXT_SPLITTER_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(TEXT_SPLITTER_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getTextConcatInputCount(node: ProductionNode) {
  const data = node.data as TextConcatNodeData;
  return Math.max(TEXT_CONCAT_MIN_INPUTS, Math.floor(Number(data.inputCount) || TEXT_CONCAT_MIN_INPUTS));
}

export function getTextPromptVariables(node: ProductionNode) {
  const data = node.data as TextPromptNodeData;
  const variables = Array.isArray(data.variables) ? data.variables : [];
  return variables.slice(0, TEXT_PROMPT_VARIABLE_MAX_INPUTS).map((variable, index) => ({
    id: typeof variable.id === 'string' && getTextPromptVariablePortIndex(variable.id) >= 0
      ? variable.id
      : getTextPromptVariablePortId(index),
    alias: typeof variable.alias === 'string' && variable.alias.trim()
      ? variable.alias.trim()
      : `Variable ${index + 1}`,
  }));
}

function getTextPromptPorts(node: ProductionNode): GraphPort[] {
  const variables = getTextPromptVariables(node);
  return [
    ...variables.map((variable, index) => ({
      id: variable.id,
      label: variable.alias || `Variable ${index + 1}`,
      kind: 'text' as const,
      side: 'input' as const,
    })),
    { id: 'text', label: 'Text', kind: 'text', side: 'output' },
  ];
}

function getTextConcatPorts(node: ProductionNode): GraphPort[] {
  const inputCount = getTextConcatInputCount(node);
  return [
    ...Array.from({ length: inputCount }, (_, index) => ({
      id: getTextConcatInputPortId(index),
      label: `Input ${index + 1}`,
      kind: 'text' as const,
      side: 'input' as const,
    })),
    { id: 'result', label: 'Result', kind: 'text', side: 'output' },
  ];
}

function getTelegramPublicationPorts(node: ProductionNode): GraphPort[] {
  const data = node.data as TelegramPublicationNodeData;
  const inputCount = Math.max(
    TELEGRAM_MEDIA_MIN_INPUTS,
    Math.min(TELEGRAM_MEDIA_MAX_INPUTS, Math.floor(Number(data.mediaInputCount) || TELEGRAM_MEDIA_MIN_INPUTS)),
  );
  return [
    { id: 'body', label: 'Text blocks', kind: 'text', side: 'input' },
    ...Array.from({ length: inputCount }, (_, index) => ({
      id: getTelegramMediaInputPortId(index),
      label: `Image ${index + 1}`,
      kind: 'image' as const,
      side: 'input' as const,
    })),
    { id: 'formatRules', label: 'Format rules', kind: 'text', side: 'input' },
    { id: 'checkRules', label: 'Check rules', kind: 'text', side: 'input' },
  ];
}

function getTextSplitterPorts(node: ProductionNode): GraphPort[] {
  const data = node.data as TextSplitterNodeData;
  const itemCount = Math.min((data.items ?? []).length, TEXT_SPLITTER_MAX_ITEMS);
  return [
    { id: 'text', label: 'Text', kind: 'text', side: 'input' },
    { id: 'items', label: 'Items', kind: 'text', side: 'output' },
    ...Array.from({ length: itemCount }, (_, index) => ({
      id: getTextSplitterItemPortId(index),
      label: `Item ${index + 1}`,
      kind: 'text' as const,
      side: 'output' as const,
    })),
  ];
}
