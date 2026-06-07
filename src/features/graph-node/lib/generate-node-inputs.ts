import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { ProductionLayerId } from '@/entities/production-graph/model/production-layers';
import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { GenerateReferenceImage, GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import { getLayerSectionText } from '@/entities/production-graph/model/layer-text-parser';
import { getIncomingImageInputs, getIncomingTextInputs, getNodeImageAssetId, getNodeLocationResult, getNodeSubjectResult, getNodeTextResult } from '@/entities/production-graph/model/graph-io';
import { buildLocationPassportText } from '@/entities/production-graph/model/location-passport';
import { buildSubjectPassportText } from '@/entities/production-graph/model/subject-passport';
import type {
  AssetRecord,
  GraphEdge,
  LocationBuilderNodeData,
  ProductionNode,
  SubjectBuilderNodeData,
} from '@/entities/production-graph/model/types';
import { MAX_GENERATE_IMAGE_REFERENCES } from '@/entities/production-graph/model/use-production-graph-store';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';

export const generateInputRows = productionLayers;
export const generateReferenceRows = productionLayers;
export type GenerateInputId = ProductionLayerId;
export type GenerateInputKind = 'empty' | 'text' | 'image' | 'subject' | 'location' | 'mixed';

export function getGenerateInputSummary(targetNodeId: string, edges: GraphEdge[], nodes: ProductionNode[]) {
  const summary = Object.fromEntries(generateReferenceRows.map((row) => [row.id, 'Empty'])) as Record<GenerateInputId, string>;

  for (const row of generateReferenceRows) {
    const incoming = edges.filter((edge) => edge.targetNodeId === targetNodeId && edge.targetPortId === row.id);
    if (incoming.length === 0) continue;

    let textCount = 0;
    let imageCount = 0;
    let subjectCount = 0;
    let locationCount = 0;
    for (const edge of incoming) {
      const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
      if (!sourceNode) continue;
      const sourcePort = getPortById(sourceNode, edge.sourcePortId);
      if (sourcePort?.kind === 'subject' && getNodeSubjectResult(sourceNode)) subjectCount += 1;
      if (sourcePort?.kind === 'location' && getNodeLocationResult(sourceNode)) locationCount += 1;
      if (getNodeTextResult(sourceNode, edge.sourcePortId)) textCount += 1;
      if (getNodeImageAssetId(sourceNode)) imageCount += 1;
    }

    const parts = [
      subjectCount > 0 ? `${subjectCount} subject` : '',
      locationCount > 0 ? `${locationCount} location` : '',
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
  let hasSubject = false;
  let hasLocation = false;
  for (const edge of edges.filter((item) => item.targetNodeId === targetNodeId && item.targetPortId === portId)) {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    if (!sourceNode) continue;
    const sourcePort = getPortById(sourceNode, edge.sourcePortId);
    if (sourcePort?.kind === 'image') {
      hasImage = true;
    } else if (sourcePort?.kind === 'subject') {
      hasSubject = true;
    } else if (sourcePort?.kind === 'location') {
      hasLocation = true;
    } else if (sourcePort) {
      hasText = true;
    }
  }
  const kindCount = [hasText, hasImage, hasSubject, hasLocation].filter(Boolean).length;
  if (kindCount > 1) return 'mixed';
  if (hasSubject) return 'subject';
  if (hasLocation) return 'location';
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
  const subjectInputs: string[] = [];
  const locationInputs: string[] = [];
  const actorImageReferenceAssetIds = new Set<string>();

  const addReferenceImageDraft = (assetId: string, referenceSlot: GenerateReferenceSlot, sourceType: ProductionNode['type']) => {
    if (referenceSlot === 'actors') {
      actorImageReferenceAssetIds.add(assetId);
      if (actorImageReferenceAssetIds.size > MAX_GENERATE_IMAGE_REFERENCES) {
        throw new Error(`В Actors можно подключить не больше ${MAX_GENERATE_IMAGE_REFERENCES} image reference. Для остальных деталей лучше использовать текстовые Extract-пресеты.`);
      }
    }
    if (!referenceImageDrafts.has(assetId) && referenceImageDrafts.size >= MAX_GENERATE_IMAGE_REFERENCES) {
      throw new Error(`Можно передать не больше ${MAX_GENERATE_IMAGE_REFERENCES} image reference в один Generate Image.`);
    }

    const draft = referenceImageDrafts.get(assetId) ?? {
      assetId,
      slots: new Set<GenerateReferenceSlot>(),
      sourceNodeTypes: new Set<ProductionNode['type']>(),
    };
    draft.slots.add(referenceSlot);
    draft.sourceNodeTypes.add(sourceType);
    referenceImageDrafts.set(assetId, draft);
  };

  for (const edge of edges.filter((item) => item.targetNodeId === targetNodeId)) {
    const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
    if (!sourceNode) continue;
    const sourcePort = getPortById(sourceNode, edge.sourcePortId);
    if (sourceNode.type === 'imageToText' && !getNodeTextResult(sourceNode, edge.sourcePortId)) {
      throw new Error('В подключенной Extract node пока нет результата. Сначала нажми Analyze, потом запускай Generate.');
    }

    const text = getNodeTextResult(sourceNode, edge.sourcePortId);
    if (edge.targetPortId === 'prompt') {
      if (text) promptInputs.push(text);
      continue;
    }
    if (edge.targetPortId === 'subject' || (edge.targetPortId === 'actors' && sourcePort?.kind === 'subject')) {
      const subjectText = getSubjectPrompt(sourceNode, edges, nodes);
      if (subjectText) subjectInputs.push(subjectText);

      if (sourceNode.type === 'subjectBuilder') {
        const subjectData = sourceNode.data as SubjectBuilderNodeData;
        subjectData.libraryImageAssetIds?.forEach((assetId) => addReferenceImageDraft(assetId, 'actors', sourceNode.type));
      }
      continue;
    }
    if (edge.targetPortId === 'background' && sourcePort?.kind === 'location') {
      const locationText = getLocationPrompt(sourceNode, edges, nodes);
      if (locationText) locationInputs.push(locationText);

      const locationImages = getIncomingImageInputs(sourceNode.id, 'image', { assets, edges, nodes });
      locationImages.forEach((image) => addReferenceImageDraft(image.assetId, 'background', sourceNode.type));
      if (sourceNode.type === 'locationBuilder') {
        const locationData = sourceNode.data as LocationBuilderNodeData;
        locationData.libraryImageAssetIds?.forEach((assetId) => addReferenceImageDraft(assetId, 'background', sourceNode.type));
      }
      continue;
    }
    if (isGenerateInputId(edge.targetPortId) && text) {
      inputs[edge.targetPortId].push(getLayerSectionText(text, edge.targetPortId) || text);
    }

    const referenceSlot = getReferenceImageSlot(edge.targetPortId);
    if (!referenceSlot) continue;

    const imageAssetId = getNodeImageAssetId(sourceNode);
    if (!imageAssetId) continue;
    addReferenceImageDraft(imageAssetId, referenceSlot, sourceNode.type);
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

  return { inputs, referenceImages, promptInputs, subjectInputs, locationInputs };
}

export function isGenerateInputId(value: string): value is GenerateInputId {
  return generateInputRows.some((row) => row.id === value);
}

function getReferenceImageSlot(value: string): GenerateReferenceSlot | null {
  if (value === 'reference') return 'reference';
  if (isGenerateInputId(value)) return value;
  return null;
}

function getSubjectPrompt(sourceNode: ProductionNode, edges: GraphEdge[], nodes: ProductionNode[]) {
  if (sourceNode.type !== 'subjectBuilder') return '';
  const data = sourceNode.data as SubjectBuilderNodeData;
  if (data.result?.trim()) return data.result.trim();
  const textInputs = getIncomingTextInputs(sourceNode.id, 'text', { edges, nodes });
  return buildSubjectPassportText(data, textInputs.map((input) => ({
    label: input.sourceLabel,
    text: input.text,
  }))).trim();
}

function getLocationPrompt(sourceNode: ProductionNode, edges: GraphEdge[], nodes: ProductionNode[]) {
  if (sourceNode.type !== 'locationBuilder') return '';
  const data = sourceNode.data as LocationBuilderNodeData;
  if (data.result?.trim()) return data.result.trim();
  const textInputs = getIncomingTextInputs(sourceNode.id, 'text', { edges, nodes });
  return buildLocationPassportText(data, textInputs.map((input) => ({
    label: input.sourceLabel,
    text: input.text,
  }))).trim();
}
