import { NODE_DEFINITIONS } from '@/entities/production-graph/model/node-registry';
import { PIPELINE_NODE_CONFIGURABLE_FIELDS } from '../contracts/image-production-tools';

export interface AssistantNodeCatalogItem {
  aliases: readonly string[];
  collapsible: boolean;
  configurableFields: readonly string[];
  description: string;
  label: string;
  portRules: readonly string[];
  ports: Array<{
    id: string;
    kind: string;
    label: string;
    side: string;
  }>;
  type: string;
}

const GENERIC_QUERY_TOKENS = new Set([
  'catalog', 'node', 'nodes', 'port', 'ports', 'type', 'types',
  'каталог', 'нода', 'ноды', 'нод', 'порт', 'порты', 'тип', 'типы',
]);

export function getAssistantNodeCatalog(query?: string): AssistantNodeCatalogItem[] {
  const needle = query?.trim().toLocaleLowerCase('ru-RU');
  const nodes = Object.values(NODE_DEFINITIONS)
    .map((definition) => ({
      aliases: NODE_ASSISTANT_METADATA[definition.type]?.aliases ?? [],
      collapsible: 'collapsible' in definition && Boolean(definition.collapsible),
      configurableFields: PIPELINE_NODE_CONFIGURABLE_FIELDS[definition.type],
      description: NODE_ASSISTANT_METADATA[definition.type]?.description
        ?? `${definition.menuLabel} node in the Image Production graph.`,
      label: definition.menuLabel,
      portRules: NODE_ASSISTANT_METADATA[definition.type]?.portRules ?? [],
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

  const tokens = needle.split(/[^\p{L}\p{N}_-]+/u)
    .filter((token) => token.length >= 2 && !GENERIC_QUERY_TOKENS.has(token));
  if (tokens.length === 0) return nodes;
  const tokenMatches = nodes.filter((node) => {
    const haystack = toSearchText(node);
    return tokens.some((token) => haystack.includes(token));
  });

  // A broad or poorly phrased model query must not turn the live catalog into
  // a false "no nodes exist" answer. Returning the bounded registry is safer
  // than encouraging the assistant to guess.
  return tokenMatches.length > 0 ? tokenMatches : nodes;
}

const NODE_ASSISTANT_METADATA: Partial<Record<keyof typeof NODE_DEFINITIONS, {
  aliases: readonly string[];
  description: string;
  portRules?: readonly string[];
}>> = {
  textPrompt: {
    aliases: [
      'prompt template', 'text template', 'variables', 'template variables',
      'текстовый шаблон', 'шаблон с переменными', 'переменные промта',
    ],
    description: [
      'Хранит редактируемый текст или текстовый шаблон.',
      'Может принимать до 10 текстовых переменных и подставлять их в места @Alias.',
      'Используй, когда порядок и подписи частей должны быть явно заданы в одной ноде.',
    ].join(' '),
    portRules: [
      'Базовый выход text передаёт готовый текст.',
      'Входы переменных создаются через settings.variables с id variable-0, variable-1 и так далее.',
      'Каждый alias из variables должен быть упомянут в settings.text как @Alias; порядок упоминаний задаёт порядок сборки.',
      'Не используй text-0/text-1: эти порты принадлежат textConcat.',
    ],
  },
  textConcat: {
    aliases: [
      'concat', 'concatenation', 'join text', 'merge text',
      'конкатенация', 'склеивание текста', 'объединение текста', 'сборка промпта',
    ],
    description: [
      'Объединяет два или больше текстовых входа в один результат.',
      'Используй, когда заметки, правила, стиль или другие управляемые части промта',
      'хранятся в отдельных textPrompt и должны поступить в один текстовый вход следующей ноды.',
    ].join(' '),
    portRules: [
      'Входы динамические: text-0, text-1, text-2 и далее; каждый вход принимает одну text-связь.',
      'Выход result передаёт объединённый текст, например в textGeneration.text.',
      'Порядок входов определяет порядок частей; separator/prefix/suffix управляют склейкой.',
    ],
  },
};

function toSearchText(node: AssistantNodeCatalogItem) {
  return JSON.stringify(node).toLocaleLowerCase('ru-RU');
}

function isFullCatalogRequest(query: string) {
  return /\b(all|available|catalog|groups?|nodes?)\b|все|доступн|каталог|групп|ноды|нод/u.test(query);
}
