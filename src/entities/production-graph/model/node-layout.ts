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
    height: size?.height ?? getNodeDefinition(type).defaultHeight,
  };
}

function getDefaultNodeWidth(type: ProductionNodeType) {
  return type === 'textFormatter' ? 400 : DEFAULT_NODE_CARD_WIDTH;
}

function normalizeNodeWidth(type: ProductionNodeType, value: unknown) {
  if (type !== 'textFormatter') return DEFAULT_NODE_CARD_WIDTH;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 400;
  return Math.min(Math.max(Math.round(value), 400), 600);
}
