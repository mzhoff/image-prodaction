import type { GraphSize, ProductionNodeType } from './types';
import { getNodeDefinition } from './node-registry';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, DEFAULT_NODE_CARD_WIDTH } from './node-defaults';

export { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO, DEFAULT_NODE_CARD_WIDTH } from './node-defaults';

export function createDefaultNodeSize(type: ProductionNodeType): GraphSize {
  return {
    width: DEFAULT_NODE_CARD_WIDTH,
    height: getNodeDefinition(type).defaultHeight,
  };
}

export function normalizeNodeSize(type: ProductionNodeType, size?: Partial<GraphSize>): GraphSize {
  return {
    width: DEFAULT_NODE_CARD_WIDTH,
    height: size?.height ?? getNodeDefinition(type).defaultHeight,
  };
}
