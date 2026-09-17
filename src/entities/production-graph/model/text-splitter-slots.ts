import { extractLayerTextSectionParseOptions } from './extract-layer-parser';
import type { TextSplitterNodeData } from './types';

export const TEXT_SPLITTER_MAX_ITEMS = 30;

type SplitterSnapshot = Pick<TextSplitterNodeData, 'items' | 'itemKeys'>;

/** item-N is a saved slot, not the index in the currently enabled sections. */
export function reconcileTextSplitterSlots(
  fragments: string[],
  previous: SplitterSnapshot,
  reservedIndices: readonly number[] = [],
) {
  const previousKeys = getTextSplitterItemKeys(previous);
  const nextKeys = identifyFragments(fragments, previousKeys);
  // Ordinary unlabelled lists retain their existing positional contract.
  if (![...previousKeys, ...nextKeys].some(isSectionKey)) {
    return { items: fragments.slice(0, TEXT_SPLITTER_MAX_ITEMS), itemKeys: [],
      overflowCount: Math.max(0, fragments.length - TEXT_SPLITTER_MAX_ITEMS) };
  }

  const itemKeys = previousKeys.slice(0, TEXT_SPLITTER_MAX_ITEMS);
  const reserved = new Set(reservedIndices.filter((index) => index >= 0 && index < TEXT_SPLITTER_MAX_ITEMS));
  const currentKeys = new Set(nextKeys);
  const items = itemKeys.map(() => '');
  let overflowCount = 0;
  fragments.forEach((fragment, index) => {
    const key = nextKeys[index];
    let slot = itemKeys.indexOf(key);
    if (slot < 0) {
      // Prefer a fresh slot: a disabled section can return even before it is wired.
      slot = itemKeys.length;
      if (slot >= TEXT_SPLITTER_MAX_ITEMS) {
        slot = itemKeys.findIndex((oldKey, oldIndex) => !reserved.has(oldIndex) && !currentKeys.has(oldKey));
      }
      if (slot < 0) { overflowCount += 1; return; }
      itemKeys[slot] = key;
    }
    items[slot] = fragment;
  });
  return { items, itemKeys, overflowCount };
}

/** Legacy documents acquire keys from the last saved items without moving edges. */
export function getTextSplitterItemKeys(data: SplitterSnapshot): string[] {
  if (data.itemKeys?.length) return data.itemKeys.slice(0, TEXT_SPLITTER_MAX_ITEMS);
  return identifyFragments((data.items ?? []).slice(0, TEXT_SPLITTER_MAX_ITEMS));
}

export function getTextSplitterSlotLabel(key: string | undefined, index: number) {
  if (key?.startsWith('section:')) return key.slice('section:'.length).toUpperCase();
  if (key?.startsWith('duplicate:')) return key.split(':')[1].toUpperCase();
  return `Item ${index + 1}`;
}

function isSectionKey(key: string) {
  return key.startsWith('section:') || key.startsWith('duplicate:');
}

function identifyFragments(fragments: string[], previousKeys: string[] = []): string[] {
  const labels = fragments.map((text) => {
    // '[' is commonly the delimiter, so the opening bracket may have been removed.
    const header = text.trim().match(/^\[?([^\]\r\n]+)\]/)?.[1];
    return header ? extractLayerTextSectionParseOptions.resolveSectionId(header)
      ?? header.replace(/\s+/g, ' ').trim().toLocaleLowerCase() : '';
  });
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return fragments.map((text, index) => {
    const label = labels[index];
    const duplicate = label && ((counts.get(label) ?? 0) > 1
      || previousKeys.some((key) => key.startsWith(`duplicate:${label}:`)));
    // Duplicate headers cannot safely identify a section: match exact text instead.
    const base = label && !duplicate ? `section:${label}`
      : `${duplicate ? `duplicate:${label}:` : 'text:'}${text.trim()}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return occurrence ? `${base}\u0000${occurrence}` : base;
  });
}
