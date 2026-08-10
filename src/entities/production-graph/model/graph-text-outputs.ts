import { getFilteredLayerText } from './layer-text-parser';
import { buildLocationPassportText } from './location-passport';
import { getPortById, getTextSplitterItemPortIndex } from './node-definitions';
import type { GraphIoContext, RoutedDataKind } from './graph-io-contracts';
import { getRouterIncomingSource, uniqueStrings } from './graph-io-sources';
import { buildSubjectPassportText } from './subject-passport';
import { getFilteredTextSectionText } from './text-section-filters';
import type {
  ImageToTextNodeData,
  IteratorNodeData,
  LocationBuilderNodeData,
  ProductionNode,
  ReferenceComposerNodeData,
  SubjectBuilderNodeData,
  TelegramPublicationNodeData,
  TextConcatNodeData,
  TextFormatterNodeData,
  TextGenerationNodeData,
  TextPromptNodeData,
  TextSplitterNodeData,
} from './types';

type GraphRoutingContext = Pick<GraphIoContext, 'edges' | 'nodes'>;

export function getNodeTextResult(
  node: ProductionNode,
  sourcePortId?: string,
  context?: GraphRoutingContext,
  visited = new Set<string>(),
): string {
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeTextResult(source.sourceNode, source.sourcePortId, context, visited) : '';
  }
  if (node.type === 'imageToText') {
    const data = node.data as ImageToTextNodeData;
    return getFilteredLayerText(data.result, data.disabledLayerIds);
  }
  if (node.type === 'textPrompt') {
    const data = node.data as TextPromptNodeData;
    return getFilteredTextSectionText(data.result || data.text, data.disabledResultFilterIds);
  }
  if (node.type === 'textConcat' || node.type === 'textGeneration') {
    const data = node.data as TextConcatNodeData | TextGenerationNodeData;
    return getFilteredTextSectionText(data.result, data.disabledResultFilterIds);
  }
  if (node.type === 'textFormatter') {
    const data = node.data as TextFormatterNodeData;
    return (data.result || data.plainText || data.sourceText || '').trim();
  }
  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'text'
      ? getFilteredTextSectionText(data.activeText, data.disabledResultFilterIds)
      : '';
  }
  if (node.type === 'textSplitter') {
    const data = node.data as TextSplitterNodeData;
    const itemIndex = sourcePortId ? getTextSplitterItemPortIndex(sourcePortId) : -1;
    return itemIndex >= 0 ? data.items?.[itemIndex]?.trim() ?? '' : data.result?.trim() ?? '';
  }
  if (node.type === 'referenceComposer') {
    const data = node.data as ReferenceComposerNodeData;
    return (data.composedPrompt || data.prompt || '').trim();
  }
  return '';
}

export function getNodeRichTextResult(
  node: ProductionNode,
  sourcePortId?: string,
  context?: GraphRoutingContext,
  visited = new Set<string>(),
): string {
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeRichTextResult(source.sourceNode, source.sourcePortId, context, visited) : '';
  }
  if (node.type !== 'textFormatter' || (sourcePortId && sourcePortId !== 'result')) return '';
  const richText = (node.data as TextFormatterNodeData).richText;
  return typeof richText === 'string' ? richText.trim() : '';
}

export function getNodeTextResults(
  node: ProductionNode,
  sourcePortId?: string,
  context?: GraphRoutingContext,
  visited = new Set<string>(),
): string[] {
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeTextResults(source.sourceNode, source.sourcePortId, context, visited) : [];
  }
  if (node.type === 'textGeneration') {
    const data = node.data as TextGenerationNodeData;
    return filterTextResults([...(data.resultTexts ?? []), data.result], data.disabledResultFilterIds);
  }
  if (node.type === 'textPrompt') {
    const data = node.data as TextPromptNodeData;
    return filterTextResults([data.result, data.text], data.disabledResultFilterIds);
  }
  if (node.type === 'textConcat') {
    const data = node.data as TextConcatNodeData;
    return filterTextResults([data.result], data.disabledResultFilterIds);
  }
  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'text'
      ? filterTextResults([data.activeText], data.disabledResultFilterIds)
      : [];
  }
  if (node.type === 'textSplitter' && (!sourcePortId || sourcePortId === 'items')) {
    const data = node.data as TextSplitterNodeData;
    return uniqueStrings([...(data.items ?? []), data.result]).map((text) => text.trim()).filter(Boolean);
  }
  const text = getNodeTextResult(node, sourcePortId, context, visited);
  return text ? [text] : [];
}

export function getNodeSubjectResult(
  node?: ProductionNode,
  context?: GraphRoutingContext,
  visited = new Set<string>(),
): string {
  if (node?.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeSubjectResult(source.sourceNode, context, visited) : '';
  }
  if (node?.type !== 'subjectBuilder') return '';
  const data = node.data as SubjectBuilderNodeData;
  return (data.result || buildSubjectPassportText(data)).trim();
}

export function getNodeLocationResult(
  node?: ProductionNode,
  context?: GraphRoutingContext,
  visited = new Set<string>(),
): string {
  if (node?.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeLocationResult(source.sourceNode, context, visited) : '';
  }
  if (node?.type !== 'locationBuilder') return '';
  const data = node.data as LocationBuilderNodeData;
  return (data.result || buildLocationPassportText(data)).trim();
}

export function getNodePublicationResult(
  node?: ProductionNode,
  context?: GraphRoutingContext,
  visited = new Set<string>(),
): string {
  if (node?.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodePublicationResult(source.sourceNode, context, visited) : '';
  }
  if (node?.type !== 'telegramPublication') return '';
  const data = node.data as TelegramPublicationNodeData;
  return (data.result || data.messageText
    || [data.publicationTitle, data.body, data.caption, data.cta].filter(Boolean).join('\n\n')).trim();
}

export function getRouterDataKind(
  node: ProductionNode | undefined,
  context: GraphRoutingContext,
  visited = new Set<string>(),
): RoutedDataKind {
  if (!node || node.type !== 'router') return 'empty';
  const source = getRouterIncomingSource(node, context, visited);
  if (!source) return 'empty';
  const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
  if (sourcePort?.kind === 'any' && source.sourceNode.type === 'router') {
    return getRouterDataKind(source.sourceNode, context, visited);
  }
  if (sourcePort?.kind === 'image' || sourcePort?.kind === 'subject'
    || sourcePort?.kind === 'location' || sourcePort?.kind === 'publication'
    || sourcePort?.kind === 'video' || sourcePort?.kind === 'audio') return sourcePort.kind;
  return 'text';
}

function filterTextResults(values: Array<string | undefined>, disabledFilterIds?: string[]) {
  return uniqueStrings(values)
    .map((text) => getFilteredTextSectionText(text, disabledFilterIds))
    .filter(Boolean);
}
