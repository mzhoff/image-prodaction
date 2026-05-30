import type { GenerateImageNodeData } from './types';

export type GenerationHistoryData = Pick<
  GenerateImageNodeData,
  'activeResultIndex' | 'resultAssetId' | 'resultAssetIds'
>;

export interface GenerationHistoryState {
  activeAssetId?: string;
  activeIndex: number;
  assetIds: string[];
}

export function getGenerationHistory(data: GenerationHistoryData): GenerationHistoryState {
  const assetIds = uniqueAssetIds([
    ...(Array.isArray(data.resultAssetIds) ? data.resultAssetIds : []),
    data.resultAssetId,
  ]);

  if (assetIds.length === 0) {
    return { activeIndex: -1, assetIds };
  }

  const resultAssetIndex = data.resultAssetId ? assetIds.indexOf(data.resultAssetId) : -1;
  const requestedIndex = typeof data.activeResultIndex === 'number' ? data.activeResultIndex : resultAssetIndex;
  const activeIndex = clampIndex(requestedIndex >= 0 ? requestedIndex : assetIds.length - 1, assetIds.length);

  return {
    activeAssetId: assetIds[activeIndex],
    activeIndex,
    assetIds,
  };
}

export function appendGenerationResult(data: GenerationHistoryData, assetId: string): Partial<GenerateImageNodeData> {
  const current = getGenerationHistory(data);
  const assetIds = uniqueAssetIds([...current.assetIds, assetId]);
  const activeIndex = assetIds.length - 1;

  return {
    activeResultIndex: activeIndex,
    resultAssetId: assetIds[activeIndex],
    resultAssetIds: assetIds,
  };
}

export function selectGenerationResult(data: GenerationHistoryData, index: number): Partial<GenerateImageNodeData> {
  const current = getGenerationHistory(data);
  if (current.assetIds.length === 0) {
    return { activeResultIndex: -1, resultAssetId: undefined, resultAssetIds: [] };
  }

  const activeIndex = clampIndex(index, current.assetIds.length);
  return {
    activeResultIndex: activeIndex,
    resultAssetId: current.assetIds[activeIndex],
    resultAssetIds: current.assetIds,
  };
}

function uniqueAssetIds(ids: Array<string | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function clampIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}
