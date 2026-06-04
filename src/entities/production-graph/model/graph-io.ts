import { getGenerationHistory } from './generation-history';
import { getPortById, getTextSplitterItemPortIndex } from './node-definitions';
import type {
  AdjustmentNodeData,
  AssetRecord,
  CropImageNodeData,
  CurvesNodeData,
  GenerateImageNodeData,
  FrequencyRetouchNodeData,
  GraphEdge,
  ImageToTextNodeData,
  ImportImageNodeData,
  PreviewNodeData,
  ProductionNode,
  RefineImageNodeData,
  ReferenceComposerNodeData,
  RemoveBackgroundNodeData,
  SketchNodeData,
  TextConcatNodeData,
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
  sourceLabel?: string;
  filename?: string;
}

export interface GraphTextInputItem extends GraphIncomingSource {
  text: string;
  sourceLabel?: string;
}

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

export function getNodeImageAssetId(node?: ProductionNode) {
  if (!node) return undefined;
  if (node.type === 'importImage') return (node.data as ImportImageNodeData).assetId;
  if (node.type === 'generateImage') return getGenerationHistory(node.data as GenerateImageNodeData).activeAssetId;
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
  return undefined;
}

export function getNodeTextResult(node: ProductionNode, sourcePortId?: string) {
  if (node.type === 'imageToText') return (node.data as ImageToTextNodeData).result?.trim() ?? '';
  if (node.type === 'textPrompt') return (node.data as TextPromptNodeData).text?.trim() ?? '';
  if (node.type === 'textConcat') return (node.data as TextConcatNodeData).result?.trim() ?? '';
  if (node.type === 'textGeneration') return (node.data as TextGenerationNodeData).result?.trim() ?? '';
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

export function getIncomingImageInputs(targetNodeId: string, targetPortId: string | undefined, context: GraphIoContext): GraphImageInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphImageInputItem[] => {
    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    if (sourcePort?.kind !== 'image') return [];

    const assetId = getNodeImageAssetId(source.sourceNode);
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

export function getIncomingTextInputs(targetNodeId: string, targetPortId: string | undefined, context: Pick<GraphIoContext, 'edges' | 'nodes'>): GraphTextInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphTextInputItem[] => {
    const text = getNodeTextResult(source.sourceNode, source.sourcePortId);
    if (!text) return [];

    return [{
      ...source,
      text,
      sourceLabel: source.sourceNode.data.title,
    }];
  });
}
