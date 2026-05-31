import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { ProductionLayerId } from '@/entities/production-graph/model/production-layers';
import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { GenerateReferenceImage, GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import { getGenerationHistory } from '@/entities/production-graph/model/generation-history';
import { getLayerSectionText } from '@/entities/production-graph/model/layer-text-parser';
import type {
  AssetRecord,
  AdjustmentNodeData,
  CropImageNodeData,
  GenerateImageNodeData,
  GraphEdge,
  ImageToTextNodeData,
  ImportImageNodeData,
  PreviewNodeData,
  ProductionNode,
  ReferenceComposerNodeData,
  RemoveBackgroundNodeData,
  SketchNodeData,
  TextPromptNodeData,
} from '@/entities/production-graph/model/types';
import { MAX_GENERATE_IMAGE_REFERENCES } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';

export const generateInputRows = productionLayers;
export const generateReferenceRows = productionLayers;
export type GenerateInputId = ProductionLayerId;
export type GenerateInputKind = 'empty' | 'text' | 'image' | 'mixed';

export function findIncomingImageAsset(
  targetNodeId: string,
  targetPortId: string,
  edges: GraphEdge[],
  nodes: ProductionNode[],
  assets: AssetRecord[],
) {
  const edge = edges.find((item) => item.targetNodeId === targetNodeId && item.targetPortId === targetPortId);
  const sourceNode = nodes.find((item) => item.id === edge?.sourceNodeId);
  const assetId = getNodeImageAssetId(sourceNode);
  return assets.find((asset) => asset.id === assetId);
}

export function getNodeImageAssetId(node?: ProductionNode) {
  if (!node) return undefined;
  if (node.type === 'importImage') return (node.data as ImportImageNodeData).assetId;
  if (node.type === 'generateImage') return getGenerationHistory(node.data as GenerateImageNodeData).activeAssetId;
  if (node.type === 'sketch') return (node.data as SketchNodeData).assetId;
  if (node.type === 'cropImage') return (node.data as CropImageNodeData).resultAssetId;
  if (node.type === 'adjustment') return (node.data as AdjustmentNodeData).resultAssetId;
  if (node.type === 'removeBackground') return (node.data as RemoveBackgroundNodeData).resultAssetId;
  if (node.type === 'preview') return (node.data as PreviewNodeData).assetId;
  return undefined;
}

export function getNodeTextResult(node: ProductionNode) {
  if (node.type === 'imageToText') return (node.data as ImageToTextNodeData).result?.trim() ?? '';
  if (node.type === 'textPrompt') return (node.data as TextPromptNodeData).text?.trim() ?? '';
  if (node.type === 'referenceComposer') {
    const data = node.data as ReferenceComposerNodeData;
    return (data.composedPrompt || data.prompt || '').trim();
  }
  return '';
}

export function getGenerateInputSummary(targetNodeId: string, edges: GraphEdge[], nodes: ProductionNode[]) {
  const summary = Object.fromEntries(generateReferenceRows.map((row) => [row.id, 'Empty'])) as Record<GenerateInputId, string>;

  for (const row of generateReferenceRows) {
    const incoming = edges.filter((edge) => edge.targetNodeId === targetNodeId && edge.targetPortId === row.id);
    if (incoming.length === 0) continue;

    let textCount = 0;
    let imageCount = 0;
    for (const edge of incoming) {
      const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
      if (!sourceNode) continue;
      if (getNodeTextResult(sourceNode)) textCount += 1;
      if (getNodeImageAssetId(sourceNode)) imageCount += 1;
    }

    const parts = [
      textCount > 0 ? `${textCount} text` : '',
      imageCount > 0 ? `${imageCount} image` : '',
    ].filter(Boolean);
    summary[row.id] = parts.join(' + ') || `${incoming.length} input`;
  }

  return summary;
}

export function getGenerateInputKinds(targetNodeId: string, portId: string, edges: GraphEdge[], nodes: ProductionNode[]): GenerateInputKind {
  let hasText = false;
  let hasImage = false;
  for (const edge of edges.filter((item) => item.targetNodeId === targetNodeId && item.targetPortId === portId)) {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    if (!sourceNode) continue;
    const sourcePort = getPortById(sourceNode, edge.sourcePortId);
    if (sourcePort?.kind === 'image') {
      hasImage = true;
    } else if (sourcePort) {
      hasText = true;
    }
  }
  if (hasText && hasImage) return 'mixed';
  if (hasImage) return 'image';
  if (hasText) return 'text';
  return 'empty';
}

export async function buildGeneratePayload(
  targetNodeId: string,
  edges: GraphEdge[],
  nodes: ProductionNode[],
  assets: AssetRecord[],
) {
  const inputs = generateInputRows.reduce((accumulator, row) => {
    accumulator[row.id] = [];
    return accumulator;
  }, {} as Record<GenerateInputId, string[]>);
  const referenceImageDrafts = new Map<string, {
    assetId: string;
    slots: Set<GenerateReferenceSlot>;
    sourceNodeTypes: Set<ProductionNode['type']>;
  }>();
  const promptInputs: string[] = [];
  const actorImageReferenceAssetIds = new Set<string>();

  for (const edge of edges.filter((item) => item.targetNodeId === targetNodeId)) {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    if (!sourceNode) continue;
    if (sourceNode.type === 'imageToText' && !getNodeTextResult(sourceNode)) {
      throw new Error('В подключенной Extract node пока нет результата. Сначала нажми Analyze, потом запускай Generate.');
    }

    const text = getNodeTextResult(sourceNode);
    if (edge.targetPortId === 'prompt') {
      if (text) promptInputs.push(text);
      continue;
    }
    if (isGenerateInputId(edge.targetPortId) && text) {
      inputs[edge.targetPortId].push(getLayerSectionText(text, edge.targetPortId) || text);
    }

    const referenceSlot = getReferenceImageSlot(edge.targetPortId);
    if (!referenceSlot) continue;

    const imageAssetId = getNodeImageAssetId(sourceNode);
    if (!imageAssetId) continue;
    if (referenceSlot === 'actors') {
      actorImageReferenceAssetIds.add(imageAssetId);
      if (actorImageReferenceAssetIds.size > 3) {
        throw new Error('В Actors можно подключить не больше 3 image reference. Для остальных деталей лучше использовать текстовые Extract-пресеты.');
      }
    }
    if (!referenceImageDrafts.has(imageAssetId) && referenceImageDrafts.size >= MAX_GENERATE_IMAGE_REFERENCES) {
      throw new Error(`Можно передать не больше ${MAX_GENERATE_IMAGE_REFERENCES} image reference в один Generate Image.`);
    }

    const draft = referenceImageDrafts.get(imageAssetId) ?? {
      assetId: imageAssetId,
      slots: new Set<GenerateReferenceSlot>(),
      sourceNodeTypes: new Set<ProductionNode['type']>(),
    };
    draft.slots.add(referenceSlot);
    draft.sourceNodeTypes.add(sourceNode.type);
    referenceImageDrafts.set(imageAssetId, draft);
  }

  const referenceImages: GenerateReferenceImage[] = [];
  for (const draft of referenceImageDrafts.values()) {
    const asset = assets.find((item) => item.id === draft.assetId);
    if (!asset) throw new Error('Один из image reference не найден в локальном хранилище.');
    const blob = await loadAssetBlob(asset);
    if (!blob) throw new Error('Не удалось прочитать image reference из локального хранилища.');
    referenceImages.push({
      dataUrl: await prepareImageForOpenRouter(blob),
      sourceAssetId: draft.assetId,
      sourceNodeTypes: Array.from(draft.sourceNodeTypes),
      slots: Array.from(draft.slots),
    });
  }

  return { inputs, referenceImages, promptInputs };
}

export function isGenerateInputId(value: string): value is GenerateInputId {
  return generateInputRows.some((row) => row.id === value);
}

function getReferenceImageSlot(value: string): GenerateReferenceSlot | null {
  if (value === 'reference') return 'reference';
  if (isGenerateInputId(value)) return value;
  return null;
}
