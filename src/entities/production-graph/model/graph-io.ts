import { getGenerationHistory } from './generation-history';
import { getPortById, getTextSplitterItemPortIndex } from './node-definitions';
import { buildLocationPassportText } from './location-passport';
import { buildSubjectPassportText } from './subject-passport';
import { getFilteredLayerText } from './layer-text-parser';
import { getFilteredTextSectionText } from './text-section-filters';
import type {
  AdjustmentNodeData,
  AssetRecord,
  BannerNodeData,
  CropImageNodeData,
  CurvesNodeData,
  GenerateImageNodeData,
  FrequencyRetouchNodeData,
  CompositionNodeData,
  GraphValueKind,
  GraphEdge,
  ImageToTextNodeData,
  ImportImageNodeData,
  IteratorNodeData,
  LocationBuilderNodeData,
  PreviewNodeData,
  ProductionNode,
  RefineImageNodeData,
  ReferenceComposerNodeData,
  RemoveBackgroundNodeData,
  SketchNodeData,
  SubjectBuilderNodeData,
  TelegramPublicationNodeData,
  TextConcatNodeData,
  TextFormatterNodeData,
  TextGenerationNodeData,
  TextPromptNodeData,
  TextSplitterNodeData,
} from './types';

export interface GraphIoContext {
  edges: GraphEdge[];
  nodes: ProductionNode[];
  assets: AssetRecord[];
}

export interface GraphIncomingSource {
  edge: GraphEdge;
  sourceNode: ProductionNode;
  sourcePortId: string;
  targetPortId: string;
}

export interface GraphImageInputItem extends GraphIncomingSource {
  asset: AssetRecord;
  assetId: string;
  collectionIndex?: number;
  sourceLabel?: string;
  sourceCollectionSize?: number;
  valueKind?: GraphValueKind;
  filename?: string;
}

export interface GraphTextInputItem extends GraphIncomingSource {
  collectionIndex?: number;
  richText?: string;
  sourceCollectionSize?: number;
  text: string;
  sourceLabel?: string;
  valueKind?: GraphValueKind;
}

export interface GraphObjectInputItem extends GraphIncomingSource {
  objectKind: 'subject' | 'location';
  sourceLabel?: string;
  text: string;
  valueKind?: GraphValueKind;
}

export type RoutedDataKind = 'audio' | 'image' | 'location' | 'publication' | 'subject' | 'text' | 'video' | 'empty';

export function getIncomingSources(targetNodeId: string, targetPortId: string | undefined, context: Pick<GraphIoContext, 'edges' | 'nodes'>) {
  const nodesById = new Map(context.nodes.map((node) => [node.id, node]));
  return context.edges.flatMap((edge): GraphIncomingSource[] => {
    if (edge.targetNodeId !== targetNodeId) return [];
    if (targetPortId && edge.targetPortId !== targetPortId) return [];

    const sourceNode = nodesById.get(edge.sourceNodeId);
    if (!sourceNode) return [];

    return [{
      edge,
      sourceNode,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
    }];
  });
}

export function getNodeImageAssetId(node?: ProductionNode, context?: GraphIoContext, visited = new Set<string>()): string | undefined {
  if (!node) return undefined;
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeImageAssetId(source.sourceNode, context, visited) : undefined;
  }
  if (node.type === 'importImage') return (node.data as ImportImageNodeData).assetId;
  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'image' ? data.activeImageAssetId : undefined;
  }
  if (node.type === 'generateImage') return getGenerationHistory(node.data as GenerateImageNodeData).activeAssetId;
  if (node.type === 'composition') return (node.data as CompositionNodeData).resultAssetId;
  if (node.type === 'sketch') return (node.data as SketchNodeData).assetId;
  if (node.type === 'cropImage') return (node.data as CropImageNodeData).resultAssetId;
  if (node.type === 'adjustment') {
    const data = node.data as AdjustmentNodeData;
    return data.resultAssetId ?? data.sourceAssetId;
  }
  if (node.type === 'curves') {
    const data = node.data as CurvesNodeData;
    return data.resultAssetId ?? data.sourceAssetId;
  }
  if (node.type === 'frequencyRetouch') {
    const data = node.data as FrequencyRetouchNodeData;
    return data.resultAssetId ?? data.sourceAssetId;
  }
  if (node.type === 'refineImage') return getGenerationHistory(node.data as RefineImageNodeData).activeAssetId;
  if (node.type === 'removeBackground') return (node.data as RemoveBackgroundNodeData).resultAssetId;
  if (node.type === 'preview') return (node.data as PreviewNodeData).assetId;
  if (node.type === 'banner') return (node.data as BannerNodeData).assetId;
  return undefined;
}

export function getNodeImageAssetIds(node?: ProductionNode) {
  if (!node) return [];
  const data = node.data as unknown as Record<string, unknown>;

  if (node.type === 'generateImage' || node.type === 'refineImage') {
    const resultAssetIds = uniqueStrings([
      ...(Array.isArray(data.resultAssetIds) ? data.resultAssetIds.filter((item): item is string => typeof item === 'string') : []),
      typeof data.resultAssetId === 'string' ? data.resultAssetId : undefined,
    ]);
    if (resultAssetIds.length > 0) return resultAssetIds;
    return node.type === 'refineImage' && typeof data.sourceAssetId === 'string' ? [data.sourceAssetId] : [];
  }

  if (node.type === 'composition') {
    const data = node.data as CompositionNodeData;
    return data.resultAssetId ? [data.resultAssetId] : [];
  }

  if (node.type === 'subjectBuilder' || node.type === 'locationBuilder') {
    return Array.isArray(data.libraryImageAssetIds)
      ? data.libraryImageAssetIds.filter((item): item is string => typeof item === 'string')
      : [];
  }

  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    const assetId = data.activeKind === 'image' ? data.activeImageAssetId : undefined;
    return assetId ? [assetId] : [];
  }

  if (node.type === 'importImage' || node.type === 'sketch' || node.type === 'preview' || node.type === 'banner') {
    return typeof data.assetId === 'string' ? [data.assetId] : [];
  }

  return uniqueStrings([
    typeof data.resultAssetId === 'string' ? data.resultAssetId : undefined,
    typeof data.sourceAssetId === 'string' ? data.sourceAssetId : undefined,
  ]);
}

export function getNodeCurrentImageAssetId(node?: ProductionNode) {
  if (!node) return undefined;
  const data = node.data as unknown as Record<string, unknown>;
  if (typeof data.resultAssetId === 'string') return data.resultAssetId;
  if (typeof data.assetId === 'string') return data.assetId;

  const assetIds = getNodeImageAssetIds(node);
  const index = getSafeIndex(typeof data.activeResultIndex === 'number' ? data.activeResultIndex : undefined, assetIds.length);
  return index >= 0 ? assetIds[index] : assetIds[0];
}

export function getNodeImageOutputAssetIds(node?: ProductionNode, context?: GraphIoContext, visited = new Set<string>()): string[] {
  if (!node) return [];
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeImageOutputAssetIds(source.sourceNode, context, visited) : [];
  }

  if (node.type === 'generateImage' || node.type === 'refineImage') {
    const history = getGenerationHistory(node.data as GenerateImageNodeData);
    if (history.assetIds.length > 0) return history.assetIds;
    return node.type === 'refineImage' && (node.data as RefineImageNodeData).sourceAssetId
      ? [(node.data as RefineImageNodeData).sourceAssetId as string]
      : [];
  }

  if (node.type === 'composition') {
    const resultAssetId = (node.data as CompositionNodeData).resultAssetId;
    return resultAssetId ? [resultAssetId] : [];
  }

  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    const assetId = data.activeKind === 'image' ? data.activeImageAssetId : undefined;
    return assetId ? [assetId] : [];
  }

  if (node.type === 'importImage' || node.type === 'sketch' || node.type === 'preview' || node.type === 'banner') {
    const assetId = (node.data as ImportImageNodeData | SketchNodeData | PreviewNodeData | BannerNodeData).assetId;
    return assetId ? [assetId] : [];
  }

  return uniqueStrings([getNodeImageAssetId(node)]);
}

export function getNodeTextResult(node: ProductionNode, sourcePortId?: string, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): string {
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
  if (node.type === 'textConcat') {
    const data = node.data as TextConcatNodeData;
    return getFilteredTextSectionText(data.result, data.disabledResultFilterIds);
  }
  if (node.type === 'textGeneration') {
    const data = node.data as TextGenerationNodeData;
    return getFilteredTextSectionText(data.result, data.disabledResultFilterIds);
  }
  if (node.type === 'textFormatter') {
    const data = node.data as TextFormatterNodeData;
    return (data.result || data.plainText || data.sourceText || '').trim();
  }
  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'text' ? getFilteredTextSectionText(data.activeText, data.disabledResultFilterIds) : '';
  }
  if (node.type === 'textSplitter') {
    const data = node.data as TextSplitterNodeData;
    const itemIndex = sourcePortId ? getTextSplitterItemPortIndex(sourcePortId) : -1;
    if (itemIndex >= 0) return data.items?.[itemIndex]?.trim() ?? '';
    return data.result?.trim() ?? '';
  }
  if (node.type === 'referenceComposer') {
    const data = node.data as ReferenceComposerNodeData;
    return (data.composedPrompt || data.prompt || '').trim();
  }
  return '';
}

export function getNodeRichTextResult(node: ProductionNode, sourcePortId?: string, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): string {
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeRichTextResult(source.sourceNode, source.sourcePortId, context, visited) : '';
  }
  if (node.type !== 'textFormatter') return '';
  if (sourcePortId && sourcePortId !== 'result') return '';
  const data = node.data as TextFormatterNodeData;
  return typeof data.richText === 'string' ? data.richText.trim() : '';
}

export function getNodeTextResults(node: ProductionNode, sourcePortId?: string, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): string[] {
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeTextResults(source.sourceNode, source.sourcePortId, context, visited) : [];
  }
  if (node.type === 'textGeneration') {
    const data = node.data as TextGenerationNodeData;
    return uniqueStrings([
      ...(Array.isArray(data.resultTexts) ? data.resultTexts : []),
      data.result,
    ]).map((text) => getFilteredTextSectionText(text, data.disabledResultFilterIds)).filter(Boolean);
  }

  if (node.type === 'textPrompt') {
    const data = node.data as TextPromptNodeData;
    return uniqueStrings([data.result, data.text])
      .map((text) => getFilteredTextSectionText(text, data.disabledResultFilterIds))
      .filter(Boolean);
  }

  if (node.type === 'textConcat') {
    const data = node.data as TextConcatNodeData;
    return uniqueStrings([data.result])
      .map((text) => getFilteredTextSectionText(text, data.disabledResultFilterIds))
      .filter(Boolean);
  }

  if (node.type === 'iterator') {
    const data = node.data as IteratorNodeData;
    return data.activeKind === 'text'
      ? uniqueStrings([data.activeText]).map((text) => getFilteredTextSectionText(text, data.disabledResultFilterIds)).filter(Boolean)
      : [];
  }

  if (node.type === 'textSplitter' && (!sourcePortId || sourcePortId === 'items')) {
    const data = node.data as TextSplitterNodeData;
    return uniqueStrings([...(data.items ?? []), data.result]).map((text) => text.trim()).filter(Boolean);
  }

  const text = getNodeTextResult(node, sourcePortId);
  return text ? [text] : [];
}

export function getNodeSubjectResult(node?: ProductionNode, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): string {
  if (node?.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeSubjectResult(source.sourceNode, context, visited) : '';
  }
  if (node?.type !== 'subjectBuilder') return '';
  const data = node.data as SubjectBuilderNodeData;
  return (data.result || buildSubjectPassportText(data)).trim();
}

export function getNodeLocationResult(node?: ProductionNode, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): string {
  if (node?.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeLocationResult(source.sourceNode, context, visited) : '';
  }
  if (node?.type !== 'locationBuilder') return '';
  const data = node.data as LocationBuilderNodeData;
  return (data.result || buildLocationPassportText(data)).trim();
}

export function getNodePublicationResult(node?: ProductionNode, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): string {
  if (node?.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodePublicationResult(source.sourceNode, context, visited) : '';
  }
  if (node?.type !== 'telegramPublication') return '';
  const data = node.data as TelegramPublicationNodeData;
  return (data.result || data.messageText || [data.publicationTitle, data.body, data.caption, data.cta].filter(Boolean).join('\n\n')).trim();
}

export function getRouterDataKind(node: ProductionNode | undefined, context: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()): RoutedDataKind {
  if (!node || node.type !== 'router') return 'empty';
  const source = getRouterIncomingSource(node, context, visited);
  if (!source) return 'empty';
  const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
  if (sourcePort?.kind === 'any' && source.sourceNode.type === 'router') return getRouterDataKind(source.sourceNode, context, visited);
  if (sourcePort?.kind === 'image' || sourcePort?.kind === 'subject' || sourcePort?.kind === 'location' || sourcePort?.kind === 'publication' || sourcePort?.kind === 'video' || sourcePort?.kind === 'audio') return sourcePort.kind;
  return 'text';
}

export function getIncomingImageInputs(targetNodeId: string, targetPortId: string | undefined, context: GraphIoContext): GraphImageInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphImageInputItem[] => {
    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    if (source.sourceNode.type === 'router') {
      return getIncomingImageInputs(source.sourceNode.id, 'input', context).slice(0, 1).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        asset: item.asset,
        assetId: item.assetId,
        filename: item.filename,
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
        valueKind: item.valueKind,
      }));
    }
    if (sourcePort?.kind !== 'image') return [];

    const assetId = getNodeImageAssetId(source.sourceNode, context);
    if (!assetId) return [];

    const asset = context.assets.find((item) => item.id === assetId);
    if (!asset) return [];

    return [{
      ...source,
      asset,
      assetId,
      sourceLabel: source.sourceNode.data.title,
      filename: asset.name,
    }];
  });
}

export function getFirstIncomingImageAsset(targetNodeId: string, targetPortId: string, context: GraphIoContext) {
  return getIncomingImageInputs(targetNodeId, targetPortId, context)[0]?.asset;
}

export function getIncomingImageCollectionInputs(targetNodeId: string, targetPortId: string | undefined, context: GraphIoContext): GraphImageInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphImageInputItem[] => {
    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    if (source.sourceNode.type === 'router') {
      return getIncomingImageCollectionInputs(source.sourceNode.id, 'input', context).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        asset: item.asset,
        assetId: item.assetId,
        collectionIndex: item.collectionIndex,
        filename: item.filename,
        sourceCollectionSize: item.sourceCollectionSize,
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
        valueKind: item.valueKind,
      }));
    }
    if (sourcePort?.kind !== 'image') return [];

    const assetIds = getNodeImageOutputAssetIds(source.sourceNode, context);
    const sourceCollectionSize = assetIds.length;
    return assetIds.flatMap((assetId, collectionIndex): GraphImageInputItem[] => {
      const asset = context.assets.find((item) => item.id === assetId);
      if (!asset) return [];

      return [{
        ...source,
        asset,
        assetId,
        collectionIndex,
        sourceCollectionSize,
        sourceLabel: source.sourceNode.data.title,
        filename: asset.name,
        valueKind: sourceCollectionSize > 1 ? 'image[]' : 'image',
      }];
    });
  });
}

export function getIncomingTextInputs(targetNodeId: string, targetPortId: string | undefined, context: Pick<GraphIoContext, 'edges' | 'nodes'>): GraphTextInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphTextInputItem[] => {
    if (source.sourceNode.type === 'router') {
      return getIncomingTextInputs(source.sourceNode.id, 'input', context).slice(0, 1).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }

    const text = getNodeTextResult(source.sourceNode, source.sourcePortId, context);
    if (!text) return [];

    return [{
      ...source,
      richText: getNodeRichTextResult(source.sourceNode, source.sourcePortId, context),
      text,
      sourceLabel: source.sourceNode.data.title,
    }];
  });
}

export function getIncomingTextCollectionInputs(targetNodeId: string, targetPortId: string | undefined, context: Pick<GraphIoContext, 'edges' | 'nodes'>): GraphTextInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphTextInputItem[] => {
    if (source.sourceNode.type === 'router') {
      return getIncomingTextCollectionInputs(source.sourceNode.id, 'input', context).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }

    const texts = getNodeTextResults(source.sourceNode, source.sourcePortId, context);
    const sourceCollectionSize = texts.length;
    return texts.map((text, collectionIndex) => ({
      ...source,
      collectionIndex,
      richText: getNodeRichTextResult(source.sourceNode, source.sourcePortId, context),
      sourceCollectionSize,
      text,
      sourceLabel: source.sourceNode.data.title,
      valueKind: sourceCollectionSize > 1 ? 'text[]' : 'text',
    }));
  });
}

export function getIncomingObjectInputs(targetNodeId: string, targetPortId: string | undefined, context: Pick<GraphIoContext, 'edges' | 'nodes'>): GraphObjectInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphObjectInputItem[] => {
    if (source.sourceNode.type === 'router') {
      return getIncomingObjectInputs(source.sourceNode.id, 'input', context).slice(0, 1).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }

    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    if (sourcePort?.kind === 'subject') {
      const text = getNodeSubjectResult(source.sourceNode, context);
      return text ? [{
        ...source,
        objectKind: 'subject',
        sourceLabel: source.sourceNode.data.title,
        text,
        valueKind: 'subject',
      }] : [];
    }
    if (sourcePort?.kind === 'location') {
      const text = getNodeLocationResult(source.sourceNode, context);
      return text ? [{
        ...source,
        objectKind: 'location',
        sourceLabel: source.sourceNode.data.title,
        text,
        valueKind: 'location',
      }] : [];
    }
    return [];
  });
}

function getRouterIncomingSource(node: ProductionNode, context?: Pick<GraphIoContext, 'edges' | 'nodes'>, visited = new Set<string>()) {
  if (!context || visited.has(node.id)) return undefined;
  visited.add(node.id);
  return getIncomingSources(node.id, 'input', context)[0];
}

function getTransparentRouterSource(routerOutput: GraphIncomingSource, originalInput: GraphIncomingSource): GraphIncomingSource {
  return {
    edge: routerOutput.edge,
    sourceNode: originalInput.sourceNode,
    sourcePortId: originalInput.sourcePortId,
    targetPortId: routerOutput.targetPortId,
  };
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function getSafeIndex(index: number | undefined, length: number) {
  if (length <= 0) return -1;
  if (typeof index !== 'number' || Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}
