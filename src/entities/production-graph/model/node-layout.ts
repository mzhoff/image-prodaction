import type { GraphSize, ProductionNodeType } from './types';
import { getNodeDefinition } from './node-registry';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, DEFAULT_NODE_CARD_WIDTH } from './node-defaults';

export { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, DEFAULT_NODE_CARD_WIDTH } from './node-defaults';

export function createDefaultNodeSize(type: ProductionNodeType): GraphSize {
  return {
    width: getDefaultNodeWidth(type),
    height: getNodeDefinition(type).defaultHeight,
  };
}

export function normalizeNodeSize(type: ProductionNodeType, size?: Partial<GraphSize>): GraphSize {
  return {
    width: normalizeNodeWidth(type, size?.width),
    height: normalizeNodeHeight(type, size?.height),
  };
}

function getDefaultNodeWidth(type: ProductionNodeType) {
  if (type === 'router') return 250;
  if (type === 'banner') return 560;
  if (type === 'composition') return 430;
  if (type === 'textToSpeech') return 400;
  return type === 'textFormatter' ? 400 : DEFAULT_NODE_CARD_WIDTH;
}

function normalizeNodeWidth(type: ProductionNodeType, value: unknown) {
  if (type === 'router') return 250;
  if (type === 'banner') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 560;
    return Math.min(Math.max(Math.round(value), 120), 1200);
  }
  if (type === 'composition') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 430;
    return Math.min(Math.max(Math.round(value), 400), 720);
  }
  if (type !== 'textFormatter' && type !== 'textToSpeech') return DEFAULT_NODE_CARD_WIDTH;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 400;
  const maxWidth = type === 'textFormatter' ? 800 : 600;
  return Math.min(Math.max(Math.round(value), 400), maxWidth);
}

function normalizeNodeHeight(type: ProductionNodeType, value: unknown) {
  if (type === 'banner') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return getNodeDefinition(type).defaultHeight;
    return Math.min(Math.max(Math.round(value), 48), 800);
  }
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : getNodeDefinition(type).defaultHeight;
}
