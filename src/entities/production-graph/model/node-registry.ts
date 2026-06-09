import { contextNodeDefinitions } from './node-registry-context';
import { imageNodeDefinitions } from './node-registry-image';
import { publicationNodeDefinitions } from './node-registry-publication';
import { textNodeDefinitions } from './node-registry-text';
import type { ProductionNodeDefinition } from './node-registry-types';
import type { ProductionNodeData, ProductionNodeType } from './types';

export type { ProductionNodeDefinition } from './node-registry-types';

export const NODE_DEFINITIONS = {
  importImage: imageNodeDefinitions.importImage,
  textPrompt: textNodeDefinitions.textPrompt,
  textConcat: textNodeDefinitions.textConcat,
  textGeneration: textNodeDefinitions.textGeneration,
  textFormatter: textNodeDefinitions.textFormatter,
  textSplitter: textNodeDefinitions.textSplitter,
  iterator: contextNodeDefinitions.iterator,
  subjectBuilder: contextNodeDefinitions.subjectBuilder,
  locationBuilder: contextNodeDefinitions.locationBuilder,
  telegramPublication: publicationNodeDefinitions.telegramPublication,
  imageToText: imageNodeDefinitions.imageToText,
  referenceComposer: imageNodeDefinitions.referenceComposer,
  generateImage: imageNodeDefinitions.generateImage,
  sketch: imageNodeDefinitions.sketch,
  cropImage: imageNodeDefinitions.cropImage,
  adjustment: imageNodeDefinitions.adjustment,
  curves: imageNodeDefinitions.curves,
  frequencyRetouch: imageNodeDefinitions.frequencyRetouch,
  refineImage: imageNodeDefinitions.refineImage,
  removeBackground: imageNodeDefinitions.removeBackground,
  exportImage: imageNodeDefinitions.exportImage,
  preview: imageNodeDefinitions.preview,
} satisfies Record<ProductionNodeType, ProductionNodeDefinition>;

export const PRODUCTION_NODE_TYPES = Object.keys(NODE_DEFINITIONS) as ProductionNodeType[];

export function getNodeDefinition(type: ProductionNodeType) {
  return NODE_DEFINITIONS[type] as ProductionNodeDefinition;
}

export function isNodeCollapsible(type: ProductionNodeType) {
  return Boolean(getNodeDefinition(type).collapsible);
}

export function createDefaultNodeData(type: ProductionNodeType): ProductionNodeData {
  return getNodeDefinition(type).createData();
}
