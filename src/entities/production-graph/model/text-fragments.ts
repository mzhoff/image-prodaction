import type { ProductionNode, TextPromptNodeData } from './types';
import { getTextHistory } from './text-result-history';
import type { TextGenerationNodeData } from './types';
import { normalizeTextSectionFilterId } from './text-section-filters';

/** Exact, complete labels are identities here; equal length is not equality. */
export function textFragmentSections(text: string) {
  const matches = [...text.matchAll(/^[^\S\r\n]*\[([^\]\r\n]+)\][^\S\r\n]*\r?$/gm)];
  return matches.map((match, index) => ({
    label: match[1].trim(), start: match.index!,
    bodyStart: match.index! + match[0].length,
    end: matches[index + 1]?.index ?? text.length,
  }));
}

export function appendTextFragment(target: string, incoming: string): string {
  // Keep first-occurrence order; consolidate ONLY complete, identical headers.
  const blocks: { label?: string; text: string }[] = [];
  for (const value of [target, incoming]) {
    const sections = textFragmentSections(value);
    const prefix = value.slice(0, sections[0]?.start ?? value.length).trim();
    if (prefix) blocks.push({ text: prefix });
    for (const section of sections) {
      const body = value.slice(section.bodyStart, section.end).trim();
      const existing = blocks.find((block) => block.label !== undefined && normalizeTextSectionFilterId(block.label) === normalizeTextSectionFilterId(section.label));
      if (existing) existing.text = [existing.text, body].filter(Boolean).join('\n\n');
      else blocks.push({ label: section.label, text: body });
    }
  }
  return blocks.map((block) => block.label ? `[${block.label}]${block.text ? `\n${block.text}` : ''}` : block.text).join('\n\n');
}

const WRITABLE_FIELDS: Partial<Record<ProductionNode['type'], readonly string[]>> = {
  textPrompt: ['text'], imageToText: ['prompt', 'result'], generateImage: ['prompt'],
  generateVideo: ['prompt'],
  refineImage: ['instruction'], textGeneration: ['instruction', 'result'],
  textConcat: ['suffix'], textFormatter: ['plainText'],
  subjectBuilder: ['identitySummary', 'immutableTraits', 'mutableAttributes', 'negativeConstraints', 'notes'],
  locationBuilder: ['description', 'spatialLayout', 'atmosphere', 'mutableAttributes', 'negativeConstraints', 'notes'],
};

export function fragmentFieldValue(node: ProductionNode, field: string): string | undefined {
  if (!WRITABLE_FIELDS[node.type]?.includes(field)) return undefined;
  if (node.type === 'textGeneration' && field === 'result') return getTextHistory(node.data as TextGenerationNodeData).activeText;
  const value = (node.data as unknown as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

export interface TextFragmentSource {
  nodeId: string;
  field?: string;
  expectedValue: string;
  start: number;
  end: number;
  copyOnly?: boolean;
  disabledLabels?: string[];
}

export type TextFragmentTarget = { nodeId: string; field: string } | { position: { x: number; y: number } };

export function hasBoundFragmentVariables(node: ProductionNode, text: string) {
  if (node.type !== 'textPrompt') return false;
  return ((node.data as TextPromptNodeData).variables ?? []).some(({ alias }) => text.includes(`@${alias}`));
}
