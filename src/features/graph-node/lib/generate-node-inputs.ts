import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { ProductionLayerId } from '@/entities/production-graph/model/production-layers';
import type {
  AssetRecord,
  GenerateImageNodeData,
  GraphEdge,
  ImageToTextNodeData,
  ImportImageNodeData,
  PreviewNodeData,
  ProductionNode,
  ReferenceComposerNodeData,
  TextPromptNodeData,
} from '@/entities/production-graph/model/types';
import { MAX_GENERATE_IMAGE_REFERENCES } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob } from '@/shared/lib/asset-db';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';

export const generateInputRows = productionLayers;
export type GenerateInputId = ProductionLayerId;

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
  if (node.type === 'generateImage') return (node.data as GenerateImageNodeData).resultAssetId;
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
  const summary = Object.fromEntries(generateInputRows.map((row) => [row.id, 'Empty'])) as Record<GenerateInputId, string>;

  for (const row of generateInputRows) {
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
  const referenceImages: string[] = [];
  const referenceImagesByAssetId = new Map<string, string>();
  let actorImageReferenceCount = 0;

  for (const edge of edges.filter((item) => item.targetNodeId === targetNodeId)) {
    if (!isGenerateInputId(edge.targetPortId)) continue;

    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    if (!sourceNode) continue;
    if (sourceNode.type === 'imageToText' && !getNodeTextResult(sourceNode)) {
      throw new Error('В подключенной Extract node пока нет результата. Сначала нажми Analyze, потом запускай Generate.');
    }

    const text = getNodeTextResult(sourceNode);
    if (text) inputs[edge.targetPortId].push(text);

    const imageAssetId = getNodeImageAssetId(sourceNode);
    if (!imageAssetId) continue;
    if (edge.targetPortId === 'actors') {
      actorImageReferenceCount += 1;
      if (actorImageReferenceCount > 3) {
        throw new Error('В Actors можно подключить не больше 3 image reference. Для остальных деталей лучше использовать текстовые Extract-пресеты.');
      }
    }
    if (referenceImagesByAssetId.has(imageAssetId)) continue;
    if (referenceImagesByAssetId.size >= MAX_GENERATE_IMAGE_REFERENCES) {
      throw new Error(`Можно передать не больше ${MAX_GENERATE_IMAGE_REFERENCES} image reference в один Generate Image.`);
    }

    const asset = assets.find((item) => item.id === imageAssetId);
    if (!asset) throw new Error('Один из image reference не найден в локальном хранилище.');
    const blob = await loadAssetBlob(asset);
    if (!blob) throw new Error('Не удалось прочитать image reference из локального хранилища.');
    const preparedImage = await prepareImageForOpenRouter(blob);
    referenceImagesByAssetId.set(imageAssetId, preparedImage);
    referenceImages.push(preparedImage);
  }

  return { inputs, referenceImages };
}

export function isGenerateInputId(value: string): value is GenerateInputId {
  return generateInputRows.some((row) => row.id === value);
}

export function formatApiError(error: unknown) {
  if (typeof error === 'string') return error;
  if (!error) return 'OpenRouter request failed';
  return JSON.stringify(error).slice(0, 500);
}
