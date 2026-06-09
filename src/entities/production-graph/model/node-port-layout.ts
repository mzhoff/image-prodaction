import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from './node-layout';
import type {
  AdjustmentNodeData,
  CropImageNodeData,
  CurvesNodeData,
  FrequencyRetouchNodeData,
  PreviewNodeData,
  ProductionNode,
  SketchNodeData,
} from './types';

export function getPortTop(node: ProductionNode, side: 'input' | 'output', index: number) {
  if (node.type === 'referenceComposer' && side === 'input') return 304 + index * 38;
  if (node.type === 'generateImage' && side === 'input') return 610 + index * 39;
  if (node.type === 'generateImage' && side === 'output') return 127;
  if (node.type === 'sketch' && side === 'output') return getSketchOutputPortTop(node);
  if (node.type === 'imageToText' && side === 'input') return 74;
  if (node.type === 'imageToText' && side === 'output') return 402;
  if (node.type === 'cropImage' && (side === 'input' || side === 'output')) return getCropImagePortTop(node);
  if (node.type === 'adjustment' && (side === 'input' || side === 'output')) return getAdjustmentPortTop(node);
  if (node.type === 'curves' && (side === 'input' || side === 'output')) return getCurvesPortTop(node);
  if (node.type === 'frequencyRetouch' && (side === 'input' || side === 'output')) return getFrequencyRetouchPortTop(node);
  if (node.type === 'refineImage' && (side === 'input' || side === 'output')) return 126;
  if (node.type === 'removeBackground' && side === 'input') return 126;
  if (node.type === 'removeBackground' && side === 'output') return 126;
  if (node.type === 'preview' && side === 'input') return getPreviewPortTop(node);
  if (node.type === 'importImage' && side === 'output') return 132;
  return Math.max(52, 120 + index * 54);
}

function getSketchOutputPortTop(node: ProductionNode) {
  const data = node.data as SketchNodeData;
  const aspectRatio = typeof data.aspectRatio === 'string' ? data.aspectRatio : DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO;
  const [rawWidth, rawHeight] = aspectRatio.split(':').map(Number);
  const ratio = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getCropImagePortTop(node: ProductionNode) {
  const data = node.data as CropImageNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 27 + (innerWidth / ratio) / 2;
}

function getAdjustmentPortTop(node: ProductionNode) {
  const data = node.data as AdjustmentNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getCurvesPortTop(node: ProductionNode) {
  const data = node.data as CurvesNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getFrequencyRetouchPortTop(node: ProductionNode) {
  const data = node.data as FrequencyRetouchNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getPreviewPortTop(node: ProductionNode) {
  const data = node.data as PreviewNodeData & { sourceAspectRatio?: number };
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}
