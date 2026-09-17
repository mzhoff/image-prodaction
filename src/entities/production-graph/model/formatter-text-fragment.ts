import { createTelegramEditorValueFromSegments } from '@/modules/telegram-formatting/core';
import type { TextFormatterNodeData } from './types';

/** Append new paragraphs without rebuilding existing links, marks, lists or images. */
export function appendFormatterTextFragment(data: TextFormatterNodeData, incoming: string) {
  const serialize = (value: string) => createTelegramEditorValueFromSegments(value, [{ text: value }]).richText;
  const text = incoming.trim();
  const plainText = [data.plainText?.trim(), text].filter(Boolean).join('\n\n');
  let document: { root: { children: unknown[] } };
  try {
    document = JSON.parse(data.richText || serialize(data.plainText || ''));
    if (!Array.isArray(document.root?.children)) throw new Error('Invalid rich text');
  } catch { document = JSON.parse(serialize(data.plainText || '')); }
  const addition = JSON.parse(serialize(text)) as typeof document;
  if (!data.plainText?.trim()) document.root.children = [];
  document.root.children.push(...addition.root.children);
  return { ...data, plainText, result: plainText, richText: JSON.stringify(document) };
}
