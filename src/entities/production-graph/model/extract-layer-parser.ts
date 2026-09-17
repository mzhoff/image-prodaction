import { extractLayerDefinitions, type ExtractLayerId } from './extract-analysis-profiles';
import { productionLayerTextSectionParseOptions } from './layer-text-parser';
import { getFilteredTextSectionText } from './text-section-filters';

// Extend Extract's vocabulary without changing the fixed ports of Generate Image.
const aliases = new Map(extractLayerDefinitions.flatMap((layer) => [
  [normalizeHeader(layer.id), layer.id] as const,
  [normalizeHeader(layer.label), layer.id] as const,
]));

export const extractLayerTextSectionParseOptions = {
  cleanupSectionText: productionLayerTextSectionParseOptions.cleanupSectionText,
  resolveSectionId: (header: string): ExtractLayerId | null => (
    aliases.get(normalizeHeader(header))
    ?? productionLayerTextSectionParseOptions.resolveSectionId(header)
  ),
};

export function getFilteredExtractLayerText(value: string | undefined, disabledLayerIds: string[] | undefined) {
  return getFilteredTextSectionText(value, disabledLayerIds, extractLayerTextSectionParseOptions);
}

export function normalizeExtractLayerIds(input: unknown): ExtractLayerId[] {
  return Array.isArray(input)
    ? Array.from(new Set(input.filter((id): id is ExtractLayerId => extractLayerDefinitions.some((layer) => layer.id === id))))
    : [];
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
