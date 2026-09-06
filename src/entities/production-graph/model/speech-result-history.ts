import { getSafeIndex, uniqueStrings } from './graph-io-sources';
import type { TextToSpeechNodeData } from './types';

export function getSpeechHistory(data: TextToSpeechNodeData) {
  const items = uniqueStrings([...(data.resultAssetIds ?? []), data.resultAssetId]);
  const activeIndex = getSafeIndex(data.activeResultIndex ?? items.length - 1, items.length);
  return { activeAssetId: items[activeIndex], activeIndex, items };
}
