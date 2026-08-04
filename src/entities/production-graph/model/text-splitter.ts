import type { TextSplitterMode } from './types';

export function splitProductionText(
  text: string,
  mode: TextSplitterMode,
  delimiter: string,
) {
  const source = text.trim();
  if (!source) return [];
  if (mode === 'paragraph') {
    return source.split(/\n\s*\n+/).map(cleanItem).filter(Boolean);
  }
  if (mode === 'delimiter') {
    return source.split(delimiter || '---').map(cleanItem).filter(Boolean);
  }
  if (mode === 'newline') {
    return source.split(/\n+/).map(cleanItem).filter(Boolean);
  }
  return source
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[\).:-]|[-*])\s+/, ''))
    .map(cleanItem)
    .filter(Boolean);
}

function cleanItem(value: string) {
  return value.trim();
}
