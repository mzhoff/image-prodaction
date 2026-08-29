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
  importImage: {
    aliases: ['image input', 'upload image', 'reference image', 'импорт изображения', 'входное изображение', 'референс'],
    description: [
      'Хранит входное изображение в графе.',
      'Для уже прикреплённого к сообщению файла передай sourceAttachmentIndex в спецификации pipeline_build/pipeline_update;',
      'для пустой ноды, которую пользователь заполнит позже, sourceAttachmentIndex не передавай.',
    ].join(' '),
    portRules: [
      'Выход image передаёт изображение в image/reference/any-вход следующей ноды.',
      'sourceAttachmentIndex не является settings ноды и допустим только для importImage.',
    ],
  },
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
      'Для самого простого рекламного макета оставляй текст частью общего generateImage-арта; создавай отдельную textPrompt только для надписи, которой пользователь явно хочет управлять независимо.',
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
  textGeneration: {
    aliases: ['generate text', 'prompt builder', 'генерация текста', 'сборка промпта'],
    description: [
      'Преобразует входной текст по стабильной instruction и возвращает текстовый результат.',
      'Используй для сборки production-ready промпта перед generateImage или для текстовой обработки.',
    ].join(' '),
    portRules: [
      'Вход text принимает ровно одну text-связь; несколько редактируемых источников сначала объедини через textConcat или шаблонную textPrompt.',
      'Выход result подключается к generateImage.prompt либо другому text-входу.',
      'instruction содержит постоянные правила, а изменяемый текст приходит через порт text.',
    ],
  },
  pipelineInput: {
    aliases: ['pipeline input', 'public input', 'endpoint input', 'вход пайплайна', 'публичный вход'],
    description: 'Объявляет изменяемые типизированные параметры, которые внешний потребитель передаёт при запуске опубликованного pipeline.',
    portRules: [
      'Каждое top-level поле settings.fields создаёт output-порт field:<field.id>; внешний API использует field.key, а не ID порта.',
      'Поддерживаются text, number, boolean, image и json. Вложенные json-поля описывают схему, но не создают отдельные graph-порты.',
      'Постоянные инструкции и правила не выноси сюда: они остаются в обычных нодах графа.',
    ],
  },
  pipelineOutput: {
    aliases: ['pipeline output', 'public output', 'endpoint result', 'выход пайплайна', 'публичный результат'],
    description: 'Явно объявляет типизированный публичный результат опубликованного pipeline.',
    portRules: [
      'Каждое top-level поле settings.fields создаёт input-порт field:<field.id>.',
      'Обязательное поле должно иметь входящую совместимую связь; optional-поле может остаться без связи.',
      'Используй semantic field.key, который не зависит от названия ноды или координат на canvas.',
    ],
  },
  structuredOutput: {
    aliases: ['structured output', 'json schema', 'json extraction', 'структурированный вывод', 'json результат'],
    description: 'Преобразует входной контекст в настоящий JSON-объект по рекурсивной типизированной схеме и проверяет результат на сервере.',
    portRules: [
      'Вход source принимает текстовый или JSON-контекст.',
      'Выход json возвращает весь валидированный объект; top-level поля также доступны как field:<field.id>.',
      'settings.fields задаёт схему до трёх уровней вложенности; тип каждого поля выбирается явно.',
    ],
  },
  generateImage: {
    aliases: ['image generation', 'generator', 'генерация изображения', 'генератор изображения'],
    description: 'Генерирует изображение по текстовому промпту и необязательным visual references.',
    portRules: [
      'Основной текстовый промпт подключай к входу prompt; выход image передаёт результат.',
      'Вход reference принимает исходное image как общий референс и не заменяет вход prompt.',
      'Порты actors/actions/composition/camera/background/style/light/color/metaphor/text принимают специализированные reference-источники, если они действительно есть в графе.',
    ],
  },
  qrCode: {
    aliases: ['qr', 'qr code', 'qr-code', 'qr generator', 'qr-код', 'куар-код', 'генератор qr-кода'],
    description: [
      'Детерминированно создаёт настоящий сканируемый QR-код как PNG, без AI-генерации.',
      'Подключённый текстовый вход имеет приоритет над локальным settings.content.',
    ].join(' '),
    portRules: [
      'Вход text принимает URL или текст; выход image передаёт готовый QR в другой image-вход, а для Composition указывается как image source в compositionBlueprints.',
      'Если URL есть в запросе, сохрани его в локальном settings.content. Если URL не дан, не спрашивай его и не выдумывай бизнес-ссылку: создай qrCode с пустым локально редактируемым content и сообщи, что его нужно заполнить для появления QR.',
      'Обычный редактируемый макет на canvas не требует pipelineInput/pipelineOutput. Добавляй типизированный Pipeline Input только при явном запросе на executable, публикацию или внешний запуск.',
      'Для явно запрошенного исполняемого URL-параметра объяви Pipeline Input field { id: target-url, key: targetUrl, kind: text, required: true } и подключи field:target-url -> qrCode.text.',
      'Не используй generateImage, image prompt или стилизованную AI-имитацию для функционального QR-кода.',
      'Штатные product-owned параметры V1: outputFormat png, 1024x1024, error correction M, margin 4, #000000 на #FFFFFF; не передавай их в assistant settings, JPEG/SVG не поддерживаются.',
    ],
  },
  composition: {
    aliases: ['layers', 'composite', 'layer composition', 'композиция', 'слои', 'сборка слоёв'],
    description: 'Собирает два или больше входных слоёв в одно изображение без запуска генерации.',
    portRules: [
      'Входы динамические: layer-0, layer-1, layer-2 и далее, максимум 24; каждый принимает одну связь.',
      'Порядок layer-N задаёт порядок слоёв; выход image передаёт собранное изображение.',
      'Порт layer-N принимает как image, так и text: textPrompt.text или textGeneration.result создаёт нативный перемещаемый текстовый слой Composition.',
      'Самый простой рекламный макет использует общий generateImage.image для героя, фона, текста и декора, а qrCode.image всегда остаётся отдельным функциональным QR-слоем. Выноси надписи и изображения в отдельные слои только когда пользователь явно хочет управлять ими независимо.',
      'Для редактируемых слоёв передавай верхнеуровневый compositionBlueprints V1: compiler проверит source-порты, назначит реальные layer-N, создаст связи и применит нормализованные координаты.',
      'Заверши обычный canvas-рецепт связью composition.image -> exportImage.image-0. Не добавляй pipelineInput/pipelineOutput, публикацию или runtime-контракт без явного запроса пользователя.',
      'Получившийся набор слоёв можно позднее оформить как переиспользуемый межпродуктовый контракт, но это отдельный этап и не часть сборки обычного макета.',
    ],
  },
  exportImage: {
    aliases: ['image output', 'export', 'экспорт изображения', 'выход изображения'],
    description: 'Финальный выход изображения с настройками формата, качества, масштаба и фона.',
    portRules: [
      'Входы динамические: image-0, image-1 и далее, максимум 10.',
      'Для одного финального результата подключай composition.image или generateImage.image к image-0.',
      'Создание ноды не запускает экспорт; запуск требует отдельного действия пользователя.',
    ],
  },
};

function toSearchText(node: AssistantNodeCatalogItem) {
  return JSON.stringify(node).toLocaleLowerCase('ru-RU');
}

function isFullCatalogRequest(query: string) {
  return /\b(all|available|catalog|groups?|nodes?)\b|все|доступн|каталог|групп|ноды|нод/u.test(query);
}
