import type { CompositionNodeData, GenerateVideoNodeData, GraphPort, ProductionNode, TelegramPublicationNodeData, TextConcatNodeData, TextPromptNodeData, TextSplitterNodeData } from './types';
import { getTextSplitterSlotLabel, TEXT_SPLITTER_MAX_ITEMS } from './text-splitter-slots';
import { NODE_PORTS } from './node-static-ports';
import { getPipelineInputPorts, getPipelineOutputPorts, getStructuredOutputPorts } from './node-pipeline-ports';
export { NODE_PORTS } from './node-static-ports';
export { pipelineFieldKindToPortKind } from './node-pipeline-ports';
import { getGeneratePromptSectionId } from './generate-image-prompt-sections';
import { getImportMediaPorts } from './import-media-ports';
export { isNodeCollapsible } from './node-registry';

export function getNodePorts(node: ProductionNode) {
  if (node.type === 'importImage') return getImportMediaPorts(node.data) ?? NODE_PORTS.importImage;
  if (node.type === 'generateImage') return [
    ...NODE_PORTS.generateImage,
    ...((node.data as import('./types').GenerateImageNodeData).promptSections ?? [])
      .filter((section) => getGeneratePromptSectionId(section.id))
      .map((section): GraphPort => ({ ...section, kind: 'text', side: 'input' })),
  ];
  if (node.type === 'generateVideo') return getGenerateVideoPorts(node);
  if (node.type === 'textPrompt') return getTextPromptPorts(node);
  if (node.type === 'imageToText') return getImageToTextPorts(node);
  if (node.type === 'textConcat') return getTextConcatPorts(node);
  if (node.type === 'textSplitter') return getTextSplitterPorts(node);
  if (node.type === 'pipelineInput') return getPipelineInputPorts(node);
  if (node.type === 'pipelineOutput') return getPipelineOutputPorts(node);
  if (node.type === 'reverieStories') {
    const sequence = (node.data as import('./node-data-stories').ReverieStoriesNodeData).storyMode === 'sequence';
    return NODE_PORTS.reverieStories.filter((port) => sequence
      ? port.id === 'story' || port.id.startsWith('document')
      : !port.id.startsWith('document-'));
  }
  if (node.type === 'structuredOutput') return getStructuredOutputPorts(node);
  if (node.type === 'telegramPublication') return getTelegramPublicationPorts(node);
  if (node.type === 'composition') return getCompositionPorts(node);
  if (node.type === 'exportImage') return getExportImagePorts(node);
  return NODE_PORTS[node.type];
}

function getGenerateVideoPorts(node: ProductionNode): GraphPort[] {
  const mode = (node.data as GenerateVideoNodeData).mode;
  return NODE_PORTS.generateVideo.filter((port) => {
    if (port.id === 'prompt' || port.id === 'video') return true;
    if (mode === 'frames') return port.id === 'first-frame' || port.id === 'last-frame';
    if (mode === 'references') return port.id.startsWith('reference-');
    return false;
  });
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
  if (sourcePort.kind === 'any' || targetPort.kind === 'any') return true;
  if (targetPort.kind === 'reference') {
    if (sourcePort.kind === 'subject') return targetPort.id === 'actors';
    if (sourcePort.kind === 'location') return targetPort.id === 'background';
    return sourcePort.kind === 'text' || sourcePort.kind === 'image' || sourcePort.kind === 'preset';
  }

  return sourcePort.kind === targetPort.kind;
}

export const TEXT_CONCAT_MIN_INPUTS = 2;
export const TEXT_CONCAT_PORT_PREFIX = 'text-';
export const EXPORT_IMAGE_MAX_INPUTS = 10;
export const EXPORT_IMAGE_MIN_INPUTS = 1;
export const EXPORT_IMAGE_PORT_PREFIX = 'image-';
export const COMPOSITION_LAYER_MAX_INPUTS = 24;
export const COMPOSITION_LAYER_MIN_INPUTS = 2;
export const COMPOSITION_LAYER_PORT_PREFIX = 'layer-';
export const TEXT_PROMPT_VARIABLE_MAX_INPUTS = 10;
export const TEXT_PROMPT_VARIABLE_PORT_PREFIX = 'variable-';
export const TELEGRAM_MEDIA_MAX_INPUTS = 10;
export const TELEGRAM_MEDIA_MIN_INPUTS = 1;
export const TELEGRAM_MEDIA_PORT_PREFIX = 'media-';
export { TEXT_SPLITTER_MAX_ITEMS } from './text-splitter-slots';
export const TEXT_SPLITTER_PORT_PREFIX = 'item-';
export const IMAGE_TO_TEXT_MAX_INPUTS = 5;
export const IMAGE_TO_TEXT_PORT_PREFIX = 'image-';

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

export function getExportImageInputPortId(index: number) {
  return `${EXPORT_IMAGE_PORT_PREFIX}${index}`;
}

export function getCompositionLayerPortId(index: number) {
  return `${COMPOSITION_LAYER_PORT_PREFIX}${index}`;
}

export function getCompositionLayerPortIndex(portId: string) {
  if (!portId.startsWith(COMPOSITION_LAYER_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(COMPOSITION_LAYER_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getExportImageInputPortIndex(portId: string) {
  if (!portId.startsWith(EXPORT_IMAGE_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(EXPORT_IMAGE_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getCompositionLayerInputCount(node: ProductionNode) {
  const data = node.data as CompositionNodeData;
  return Math.max(
    COMPOSITION_LAYER_MIN_INPUTS,
    Math.min(COMPOSITION_LAYER_MAX_INPUTS, Math.floor(Number(data.layerInputCount) || COMPOSITION_LAYER_MIN_INPUTS)),
  );
}

export function getTextConcatInputCount(node: ProductionNode) {
  const data = node.data as TextConcatNodeData;
  return Math.max(TEXT_CONCAT_MIN_INPUTS, Math.floor(Number(data.inputCount) || TEXT_CONCAT_MIN_INPUTS));
}

export function getImageToTextInputPortId(index: number) {
  return `${IMAGE_TO_TEXT_PORT_PREFIX}${index}`;
}

export function getImageToTextInputPortIndex(portId: string) {
  if (!portId.startsWith(IMAGE_TO_TEXT_PORT_PREFIX)) return -1;
  const index = Number(portId.slice(IMAGE_TO_TEXT_PORT_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

export function getImageToTextInputCount(node: ProductionNode) {
  const data = node.data as { imageInputCount?: number };
  return Math.max(1, Math.min(IMAGE_TO_TEXT_MAX_INPUTS, Math.floor(Number(data.imageInputCount) || 1)));
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

function getImageToTextPorts(node: ProductionNode): GraphPort[] {
  return [
    ...Array.from({ length: getImageToTextInputCount(node) }, (_, index) => ({
      id: getImageToTextInputPortId(index), label: `Image ${index + 1}`, kind: 'image' as const, side: 'input' as const,
    })),
    { id: 'result', label: 'Result', kind: 'text' as const, side: 'output' as const },
  ];
}

export function getExportImageInputCount(node: ProductionNode) {
  const data = node.data as { imageInputCount?: number };
  return Math.max(
    EXPORT_IMAGE_MIN_INPUTS,
    Math.min(EXPORT_IMAGE_MAX_INPUTS, Math.floor(Number(data.imageInputCount) || EXPORT_IMAGE_MIN_INPUTS)),
  );
}

function getCompositionPorts(node: ProductionNode): GraphPort[] {
  const inputCount = getCompositionLayerInputCount(node);
  return [
    ...Array.from({ length: inputCount }, (_, index) => ({
      id: getCompositionLayerPortId(index),
      label: `Layer ${index + 1}`,
      kind: 'any' as const,
      side: 'input' as const,
    })),
    { id: 'image', label: 'Image', kind: 'image' as const, side: 'output' as const },
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

function getExportImagePorts(node: ProductionNode): GraphPort[] {
  const inputCount = getExportImageInputCount(node);
  return [
    ...Array.from({ length: inputCount }, (_, index) => ({
      id: getExportImageInputPortId(index),
      label: `Image ${index + 1}`,
      kind: 'image' as const,
      side: 'input' as const,
    })),
    { id: 'image', label: 'Result', kind: 'image' as const, side: 'output' as const },
  ];
}

function getTextSplitterPorts(node: ProductionNode): GraphPort[] {
  const data = node.data as TextSplitterNodeData;
  const itemCount = Math.min(Math.max(data.items?.length ?? 0, data.itemKeys?.length ?? 0), TEXT_SPLITTER_MAX_ITEMS);
  return [
    { id: 'text', label: 'Text', kind: 'text', side: 'input' },
    { id: 'items', label: 'Items', kind: 'text', side: 'output' },
    ...Array.from({ length: itemCount }, (_, index) => ({
      id: getTextSplitterItemPortId(index),
      label: getTextSplitterSlotLabel(data.itemKeys?.[index], index),
      kind: 'text' as const,
      side: 'output' as const,
    })),
  ];
}
