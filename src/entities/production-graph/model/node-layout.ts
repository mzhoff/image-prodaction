import type { GraphSize, ProductionNodeType } from './types';

export const DEFAULT_NODE_CARD_WIDTH = 400;
export const DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO = '1:1';

const DEFAULT_NODE_HEIGHT_BY_TYPE: Record<ProductionNodeType, number> = {
  importImage: 300,
  textPrompt: 230,
  imageToText: 468,
  referenceComposer: 650,
  generateImage: 720,
  sketch: 390,
  cropImage: 638,
  adjustment: 720,
  removeBackground: 360,
  exportImage: 400,
  preview: 360,
};

export function createDefaultNodeSize(type: ProductionNodeType): GraphSize {
  return {
    width: DEFAULT_NODE_CARD_WIDTH,
    height: DEFAULT_NODE_HEIGHT_BY_TYPE[type],
  };
}

export function normalizeNodeSize(type: ProductionNodeType, size?: Partial<GraphSize>): GraphSize {
  return {
    width: DEFAULT_NODE_CARD_WIDTH,
    height: size?.height ?? DEFAULT_NODE_HEIGHT_BY_TYPE[type],
  };
}
