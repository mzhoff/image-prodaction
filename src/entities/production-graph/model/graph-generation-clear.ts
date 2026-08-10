import type { ProductionNode, ProductionNodeData } from './types';

export function hasClearableGenerationData(node: ProductionNode) {
  const data = node.data as unknown as Record<string, unknown>;
  if (node.type === 'generateImage' || node.type === 'refineImage' || node.type === 'textToSpeech') {
    return Boolean(data.resultAssetId)
      || (Array.isArray(data.resultAssetIds) && data.resultAssetIds.length > 0);
  }
  if (node.type === 'textGeneration') {
    return Boolean(data.result) || (Array.isArray(data.resultTexts) && data.resultTexts.length > 0);
  }
  if (node.type === 'subjectBuilder' || node.type === 'locationBuilder') {
    return Array.isArray(data.libraryImageAssetIds) && data.libraryImageAssetIds.length > 0;
  }
  return Boolean(data.resultAssetId);
}

export function getClearedGenerationData(node: ProductionNode): Partial<ProductionNodeData> {
  if (node.type === 'generateImage' || node.type === 'refineImage') {
    return {
      activeResultIndex: -1,
      resultAssetId: undefined,
      resultAssetIds: [],
      resultMetadata: {},
      generationRequest: undefined,
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'textGeneration') {
    return {
      activeResultIndex: -1,
      disabledResultFilterIds: [],
      result: '',
      resultTexts: [],
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'textToSpeech') {
    return {
      activeResultIndex: -1,
      resultAssetId: undefined,
      resultAssetIds: [],
      resultMetadata: {},
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'subjectBuilder') {
    return {
      libraryImageAssetIds: [],
      referenceGenerationBatchPending: false,
      referenceGenerationRequests: {},
      message: '',
    } as Partial<ProductionNodeData>;
  }
  if (node.type === 'locationBuilder') return { libraryImageAssetIds: [], message: '' } as Partial<ProductionNodeData>;
  return { resultAssetId: undefined, message: '' } as Partial<ProductionNodeData>;
}
