import { productionLayers } from './production-layers';
import type { ProductionLayerId } from './production-layers';
import { getFilteredTextSectionText, parseTextSectionFilters, parseTextSectionSegments } from './text-section-filters';

export interface ParsedLayerSection {
  layerId: ProductionLayerId;
  label: string;
  text: string;
}

export interface LayerTextSegment {
  header?: string;
  layerId?: ProductionLayerId;
  label?: string;
  text: string;
  type: 'layer' | 'plain';
}

const ignoredHeaders = new Set(['selected layers', 'reference exclusions', 'global negative constraints', 'routing']);
const aliases = buildAliases();
export const productionLayerTextSectionParseOptions = {
  cleanupSectionText: cleanupLayerText,
  resolveSectionId: getLayerIdFromHeader,
};

export function parseLayerSections(value?: string) {
  return parseTextSectionFilters(value, productionLayerTextSectionParseOptions)
    .filter((section) => section.text.trim().length > 0)
    .map((section) => ({
      layerId: section.id as ProductionLayerId,
      label: section.label,
      text: section.text,
    }));
}

export function getParsedLayerIds(value?: string) {
  return Array.from(new Set(parseLayerSections(value).map((section) => section.layerId)));
}

export function getLayerSectionText(value: string, layerId: ProductionLayerId) {
  return parseLayerSections(value)
    .filter((section) => section.layerId === layerId)
    .map((section) => section.text)
    .join('\n\n')
    .trim();
}

export function getFilteredLayerText(value: string | undefined, disabledLayerIds: string[] | undefined) {
  return getFilteredTextSectionText(value, disabledLayerIds, productionLayerTextSectionParseOptions);
}

export function getParsedLayerSegments(value?: string) {
  return parseLayerTextSegments(value);
}

export function isProductionLayerId(value: string): value is ProductionLayerId {
  return productionLayers.some((layer) => layer.id === value);
}

export function normalizeProductionLayerIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is ProductionLayerId => typeof item === 'string' && isProductionLayerId(item)) : [];
}

function parseLayerTextSegments(value?: string): LayerTextSegment[] {
  return parseTextSectionSegments(value, productionLayerTextSectionParseOptions).map((segment) => (
    segment.type === 'section'
      ? {
        header: segment.header,
        label: segment.label,
        layerId: segment.id as ProductionLayerId,
        text: segment.text,
        type: 'layer',
      }
      : {
        text: segment.text,
        type: 'plain',
      }
  ));
}

function getLayerIdFromHeader(header: string) {
  const normalized = normalizeHeader(header);
  if (ignoredHeaders.has(normalized)) return null;
  return aliases.get(normalized) ?? null;
}

function cleanupLayerText(value: string) {
  return value
    .replace(/^\s*Generation-ready description:\s*/i, '')
    .trim();
}

function buildAliases() {
  const map = new Map<string, ProductionLayerId>();
  for (const layer of productionLayers) {
    addAlias(map, layer.id, layer.id);
    addAlias(map, layer.label, layer.id);
    layer.label.split('/').forEach((part) => addAlias(map, part, layer.id));
  }

  addAlias(map, 'subject', 'actors');
  addAlias(map, 'subjects', 'actors');
  addAlias(map, 'pose object state', 'actions');
  addAlias(map, 'background environment', 'background');
  addAlias(map, 'environment', 'background');
  addAlias(map, 'lighting', 'light');
  addAlias(map, 'color grade', 'color');
  addAlias(map, 'grade', 'color');
  addAlias(map, 'metaphor meaning', 'metaphor');
  addAlias(map, 'meaning', 'metaphor');
  addAlias(map, 'typography callouts', 'text');
  return map;
}

function addAlias(map: Map<string, ProductionLayerId>, alias: string, layerId: ProductionLayerId) {
  const normalized = normalizeHeader(alias);
  if (normalized) map.set(normalized, layerId);
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
