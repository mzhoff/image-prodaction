import {
  NODE_HELP_METADATA,
  type ProductionNodeAvailability,
  type ProductionNodeExecution,
} from '@/entities/production-graph/model/node-help';
import {
  NODE_DEFINITIONS,
  PRODUCTION_NODE_TYPES,
} from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { PIPELINE_NODE_CONFIGURABLE_FIELDS } from '../contracts/image-production-tools';

export interface AssistantNodeCatalogItem {
  aliases: readonly string[];
  availability: ProductionNodeAvailability;
  capabilities: readonly string[];
  collapsible: boolean;
  configurableFields: readonly string[];
  description: string;
  execution: ProductionNodeExecution;
  label: string;
  limitations: readonly string[];
  portRules: readonly string[];
  ports: Array<{
    id: string;
    kind: string;
    label: string;
    side: string;
  }>;
  type: ProductionNodeType;
}

const GENERIC_QUERY_TOKENS = new Set([
  'catalog', 'node', 'nodes', 'port', 'ports', 'type', 'types',
  'каталог', 'нода', 'ноды', 'нод', 'порт', 'порты', 'тип', 'типы',
]);

export function getAssistantNodeCatalog(query?: string): AssistantNodeCatalogItem[] {
  const nodes = PRODUCTION_NODE_TYPES.map(createAssistantNodeCatalogItem);
  const needle = normalizeSearchValue(query ?? '');
  if (!needle) return nodes;

  const typeMatches = nodes.filter((node) => normalizeSearchValue(node.type) === needle);
  if (typeMatches.length > 0) return typeMatches;

  const labelMatches = nodes.filter((node) => normalizeSearchValue(node.label) === needle);
  if (labelMatches.length > 0) return labelMatches;

  const aliasMatches = nodes.filter((node) => (
    node.aliases.some((alias) => normalizeSearchValue(alias) === needle)
  ));
  if (aliasMatches.length > 0) return aliasMatches;

  const taggedTypeMatches = nodes.filter((node) => hasTaggedIdentity(needle, node.type));
  if (taggedTypeMatches.length > 0) return taggedTypeMatches;

  const taggedLabelMatches = nodes.filter((node) => hasTaggedIdentity(needle, node.label));
  if (taggedLabelMatches.length > 0) return taggedLabelMatches;

  if (isFullCatalogRequest(needle)) return nodes;

  const phraseMatches = nodes.filter((node) => toSearchText(node).includes(needle));
  if (phraseMatches.length > 0) return phraseMatches;

  const tokens = needle.split(/[^\p{L}\p{N}_-]+/u)
    .filter((token) => token.length >= 2 && !GENERIC_QUERY_TOKENS.has(token));
  if (tokens.length === 0) return nodes;
  const scoredNodes = nodes.map((node) => {
    const haystack = toSearchText(node);
    return {
      node,
      score: tokens.filter((token) => haystack.includes(token)).length,
    };
  });
  const bestScore = Math.max(...scoredNodes.map(({ score }) => score));
  const tokenMatches = scoredNodes
    .filter(({ score }) => score === bestScore && score > 0)
    .map(({ node }) => node);

  // A broad or poorly phrased model query must not turn the live catalog into
  // a false "no nodes exist" answer. Returning the bounded registry is safer
  // than encouraging the assistant to guess.
  return tokenMatches.length > 0 ? tokenMatches : nodes;
}

function createAssistantNodeCatalogItem(type: ProductionNodeType): AssistantNodeCatalogItem {
  const definition = NODE_DEFINITIONS[type];
  const help = NODE_HELP_METADATA[type];
  return {
    aliases: help.aliases,
    availability: help.availability,
    capabilities: help.capabilities,
    collapsible: 'collapsible' in definition && Boolean(definition.collapsible),
    configurableFields: PIPELINE_NODE_CONFIGURABLE_FIELDS[type],
    description: help.summary,
    execution: help.execution,
    label: definition.menuLabel,
    limitations: help.limitations,
    portRules: help.portRules,
    ports: definition.ports.map((port) => ({
      id: port.id,
      kind: port.kind,
      label: port.label,
      side: port.side,
    })),
    type,
  };
}

function toSearchText(node: AssistantNodeCatalogItem) {
  return JSON.stringify({
    aliases: node.aliases,
    capabilities: node.capabilities,
    configurableFields: node.configurableFields,
    description: node.description,
    label: node.label,
    limitations: node.limitations,
    portRules: node.portRules,
    ports: node.ports,
    type: node.type,
  }).toLocaleLowerCase('ru-RU');
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function hasTaggedIdentity(query: string, identity: string) {
  const escapedIdentity = escapeRegex(normalizeSearchValue(identity));
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_-])(?:тип|type|нода|node)\\s+[«"'(]*${escapedIdentity}(?=$|[^\\p{L}\\p{N}_-])`,
    'u',
  ).test(query);
}

function isFullCatalogRequest(query: string) {
  return /\bnode[_ -]?catalog\b|\b(?:all|available)\s+(?:node\s+)?(?:types|nodes)\b|\bnode\s+groups?\b/u.test(query)
    || /(?:^|\s)(?:все|какие)\s+(?:доступн[а-яё]*\s+)?(?:типы\s+)?нод[а-яё]*(?:\s|$)/u.test(query)
    || /каталог(?:\s+[а-яё]+){0,2}\s+нод[а-яё]*/u.test(query)
    || /групп[а-яё]*\s+нод[а-яё]*/u.test(query);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
