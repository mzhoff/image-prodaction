import type { TextGenerationNodeData } from './types';

export function getTextHistory(data: TextGenerationNodeData) {
  const versions = (data.resultTexts ?? []).map((item) => item.trim());
  // An intentionally emptied active version must not jump to an older result.
  const items = [...new Set([...versions, ...(data.result?.trim() ? [data.result.trim()] : [])])];
  if (!items.length) return { activeIndex: -1, activeText: '', items };
  const activeIndex = Math.min(Math.max(data.activeResultIndex ?? items.length - 1, 0), items.length - 1);
  return { activeIndex, activeText: items[activeIndex] ?? '', items };
}

export function updateTextResult(data: TextGenerationNodeData, text: string): Partial<TextGenerationNodeData> {
  const history = getTextHistory(data);
  const activeIndex = history.activeIndex >= 0 ? history.activeIndex : 0;
  const items = history.items.length ? [...history.items] : [''];
  items[activeIndex] = text;
  return { activeResultIndex: activeIndex, result: text, resultTexts: items };
}
