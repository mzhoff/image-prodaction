import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { getGeneratePromptSectionId } from '@/entities/production-graph/model/generate-image-prompt-sections';
import type { GenerateImageNodeData, GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { DEFAULT_IMAGE_MODEL, MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES, type OpenRouterModelCatalog } from '@/shared/api/openrouter-models';
import { getGenerateInputKinds } from '../lib/generate-node-inputs';

export function getGenerateImageSelection(node: ProductionNode, edges: GraphEdge[], nodes: ProductionNode[], catalog: OpenRouterModelCatalog) {
  const data = node.data as GenerateImageNodeData;
  const imageModels = catalog.generationModels ?? catalog.imageModels;
  const selectedModel = data.model || DEFAULT_IMAGE_MODEL;
  const selectedImageModel = imageModels.find((model) => model.id === selectedModel);
  const aspectRatios = selectedImageModel?.aspectRatios?.length ? selectedImageModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const sizes = selectedImageModel?.sizes?.length ? selectedImageModel.sizes : MODEL_FALLBACK_SIZES;
  const selectedAspectRatio = data.aspectRatio;
  const selectedSize = data.size;
  const connectedLayerPorts = getNodePorts(node).filter((port) => port.kind === 'reference'
    && edges.some((edge) => edge.targetNodeId === node.id && edge.targetPortId === port.id));
  const legacyReferenceRows = connectedLayerPorts.filter((port) => {
    const kind = getGenerateInputKinds(node.id, port.id, edges, nodes);
    return kind !== 'text' && kind !== 'empty';
  });
  const promptRows = [
    ...getNodePorts(node).filter((port) => getGeneratePromptSectionId(port.id)),
    ...connectedLayerPorts.filter((port) => !legacyReferenceRows.includes(port)),
  ];
  return { imageModels, selectedModel, selectedImageModel, aspectRatios, sizes, selectedAspectRatio,
    selectedSize, promptRows, legacyReferenceRows };
}

export function getGenerateImageModelChange(model: string, data: GenerateImageNodeData, imageModels: OpenRouterModelCatalog['imageModels']) {
  const nextModel = imageModels.find((item) => item.id === model);
  const nextAspectRatios = nextModel?.aspectRatios?.length ? nextModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const nextSizes = nextModel?.sizes?.length ? nextModel.sizes : MODEL_FALLBACK_SIZES;
  return {
    model,
    imageQuality: undefined, imageBackground: undefined, imageFormat: undefined,
    imageCompression: undefined, imageSeed: undefined,
    aspectRatio: nextAspectRatios.includes(data.aspectRatio) ? data.aspectRatio : nextAspectRatios[0],
    size: nextSizes.includes(data.size) ? data.size : nextSizes[0],
  };
}
