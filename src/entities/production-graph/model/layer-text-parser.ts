import { productionLayers } from './production-layers';
import type { ProductionLayerId } from './production-layers';

export interface ParsedLayerSection {
  layerId: ProductionLayerId;
  label: string;
  text: string;
}

const headerPattern = /^\s*\[([^\]]+)]\s*$/gim;
const ignoredHeaders = new Set(['selected layers', 'reference exclusions', 'global negative constraints', 'routing']);
const aliases = buildAliases();

export function parseLayerSections(value?: string) {
  if (!value?.trim()) return [];

  const matches = Array.from(value.matchAll(headerPattern));
  const sections: ParsedLayerSection[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const rawHeader = match[1] ?? '';
    const layerId = getLayerIdFromHeader(rawHeader);
    if (!layerId || match.index === undefined) continue;

    const nextMatch = matches[index + 1];
    const start = match.index + match[0].length;
    const end = nextMatch?.index ?? value.length;
    const text = cleanupLayerText(value.slice(start, end));
    if (!text) continue;

    const layer = productionLayers.find((item) => item.id === layerId);
    sections.push({ layerId, label: layer?.label ?? layerId, text });
  }

  return sections;
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
