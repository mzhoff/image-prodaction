import { NODE_DEFINITIONS } from '@/entities/production-graph/model/node-registry';

export interface AssistantNodeCatalogItem {
  collapsible: boolean;
  label: string;
  ports: Array<{
    id: string;
    kind: string;
    label: string;
    side: string;
  }>;
  type: string;
}

export function getAssistantNodeCatalog(query?: string): AssistantNodeCatalogItem[] {
  const needle = query?.trim().toLocaleLowerCase('ru-RU');
  const nodes = Object.values(NODE_DEFINITIONS)
    .map((definition) => ({
      collapsible: 'collapsible' in definition && Boolean(definition.collapsible),
      label: definition.menuLabel,
      ports: definition.ports.map((port) => ({
        id: port.id,
        kind: port.kind,
        label: port.label,
        side: port.side,
      })),
      type: definition.type,
    }));

  if (!needle || isFullCatalogRequest(needle)) return nodes;

  const exactMatches = nodes.filter((node) => toSearchText(node).includes(needle));
  if (exactMatches.length > 0) return exactMatches;

  const tokens = needle.split(/[^\p{L}\p{N}_-]+/u).filter((token) => token.length >= 2);
  const tokenMatches = nodes.filter((node) => {
    const haystack = toSearchText(node);
    return tokens.some((token) => haystack.includes(token));
  });

  // A broad or poorly phrased model query must not turn the live catalog into
  // a false "no nodes exist" answer. Returning the bounded registry is safer
  // than encouraging the assistant to guess.
  return tokenMatches.length > 0 ? tokenMatches : nodes;
}

function toSearchText(node: AssistantNodeCatalogItem) {
  return JSON.stringify(node).toLocaleLowerCase('ru-RU');
}

function isFullCatalogRequest(query: string) {
  return /\b(all|available|catalog|groups?|nodes?)\b|все|доступн|каталог|групп|ноды|нод/u.test(query);
}
