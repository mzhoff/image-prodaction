import type { ProductionLayerId } from './production-layers';
import { productionLayers } from './production-layers';
import type { ExtractPresetId } from './types';

export interface ExtractPreset {
  id: ExtractPresetId;
  label: string;
  prompt: string;
}

const allLayerIds = productionLayers.map((layer) => layer.id);
const allLayerLabels = new Map(productionLayers.map((layer) => [layer.id, layer.label]));

const baseExtractContract = `Ты senior art director и prompt engineer для AI image production.

На входе изображение и список selectedLayers. Проанализируй изображение как production reference и извлеки только визуальные слои из selectedLayers.

Для selectedLayers:
- дай подробное, конкретное, generation-ready описание;
- описывай слой так, чтобы его можно было напрямую использовать как часть промпта для генерации нового изображения;
- сохраняй важные visual details, production-логику и признаки, которые должны быть перенесены.

Для unselectedLayers:
- не анализируй эти слои;
- не описывай их;
- не выводи по ним exclusions, negative prompts, routing или любые служебные блоки;
- просто игнорируй визуальные свойства, которые относятся только к unselectedLayers.

Важно:
- Не пересказывай все изображение целиком.
- Не смешивай выбранные и невыбранные слои.
- Если слой выбран, он является позитивным source-of-truth.
- Если слой не выбран, он не должен появляться в результате.
- Не добавляй факты, которых нельзя вывести из изображения.
- Если что-то неочевидно, укажи это в uncertainty.
- Если изображение является рекламным макетом, hero-блоком, продуктовой карточкой, баннером, обложкой или commercial poster, анализируй его как commercial / product / editorial layout.
- Пиши на русском языке, но production-термины можно оставлять на английском.
- Не возвращай разделы с исключениями, негативными ограничениями, routing, unselected layers или служебными объяснениями.`;

const selectedLayerTasks: Record<ProductionLayerId, string> = {
  actors: `Извлеки слой Actors / Subjects.
Опиши главных субъектов кадра: людей, персонажей, животных, продукты, объекты, интерфейсы, устройства или другие смысловые центры.
Нужно извлечь: кто или что является главным субъектом; количество субъектов; роль в кадре; внешний вид, силуэт, форма, пропорции; материалы, поверхность, одежда, аксессуары или конструктивные детали; лицо, выражение и характер, если видно; отличительные признаки; что должно остаться узнаваемым; что можно менять без потери идентичности. Если людей нет, считай главным субъектом продукт, объект, интерфейс, устройство или абстрактную визуальную сущность. Не идентифицируй реальных людей по имени.`,
  actions: `Извлеки слой Actions / Pose / Object State.
Опиши, что происходит в кадре и в каком состоянии находятся субъекты или объекты.
Нужно извлечь: основное действие или состояние сцены; позу тела, наклон корпуса, положение головы, рук, ног; направление взгляда; жесты; взаимодействие между субъектами, предметами, интерфейсами, устройствами или средой; движение или статичность; направление движения; ощущение динамики: floating, suspended, falling, walking, sitting, presenting, using, demonstrating, resting, static product display. Если явного действия нет, опиши точное состояние сцены.`,
  composition: `Извлеки слой Composition.
Опиши, как изображение собрано внутри рамки.
Нужно извлечь: формат и ориентацию кадра; положение главного объекта; масштаб относительно кадра; передний, средний и задний план; расположение второстепенных элементов; визуальную иерархию; negative space и зоны под текст, UI или callouts; симметрию или асимметрию; диагонали, оси, ритм, сетку, группировку; перекрытия объектов и глубину; плотность деталей; как композиция поддерживает рекламную, продуктовую, editorial или hero-задачу. Точное содержание текста относится к слою Text.`,
  camera: `Извлеки слой Camera.
Опиши, откуда и как камера смотрит на сцену. Для 3D-рендера, UI-мока, hero-иллюстрации или постера описывай виртуальную камеру.
Нужно извлечь: тип плана; ракурс: frontal, three-quarter, side, top-down, low angle, high angle, isometric, orthographic-like; высоту камеры; дистанцию; перспективу: flat, moderate, strong, wide-angle, telephoto compression; ощущение фокусного расстояния; depth of field; точку фокуса; дисторсию или отсутствие искажений; ощущение съемки: studio product photography, editorial hero, cinematic shot, 3D render camera, UI mockup camera. Если параметр нельзя определить точно, пиши "визуально воспринимается как".`,
  background: `Извлеки слой Background / Environment.
Опиши фон, окружение, пространство, поверхность и атмосферу вокруг главного объекта.
Нужно извлечь: тип фона; есть ли физическая поверхность, пол, стол, горизонт, стена; глубину среды; ключевые фоновые элементы; уровень детализации; активность или нейтральность фона; сетку, дымку, частицы, паттерны, архитектуру, интерфейсные элементы; атмосферные детали; зоны под текст, UI overlays, callouts или HTML-слои; что должно оставаться чистым и не отвлекать. Если фон почти отсутствует, опиши clean empty background, studio void, gradient backdrop или transparent-friendly environment.`,
  style: `Извлеки слой Style.
Опиши визуальный язык и production look изображения: как оно сделано, какой техникой и в какой эстетике.
Нужно извлечь: техника: photo, 3D render, CGI, vector, editorial illustration, product render, UI mockup, mixed media; уровень реализма; жанр: commercial poster, SaaS hero illustration, product advertising layout, cinematic frame, premium editorial, ecommerce visual; характер материалов: glassmorphism, frosted glass, matte, glossy, metallic, leather, plastic, soft gradients; детализацию; обработку краев; визуальную плотность; степень премиальности; aesthetic mood. Описывай стиль так, чтобы его можно было применить к другой сцене без копирования исходных объектов.`,
  light: `Извлеки слой Light / Lighting.
Опиши световую постановку сцены.
Нужно извлечь: главный источник света; направление; мягкость или жесткость; fill light, rim light, backlight, top light, side light; контраст освещения; характер теней; блики и отражения; ambient occlusion и контактные тени; glow, bloom, haze, volumetric light; температуру света; какие детали свет подчеркивает; как свет отделяет главный объект от фона. Для UI/иллюстративных изображений описывай visual lighting system: panel glow, glass reflections, soft interface highlights, ambient digital lighting.`,
  color: `Извлеки слой Color / Grade.
Опиши цветовую систему изображения.
Нужно извлечь: доминирующие, второстепенные и акцентные цвета; цветовые роли: фон, главный объект, акценты, UI, тени, подсветки; распределение цветов по площади кадра; насыщенность; контраст; температуру; общий grade: cinematic, clean commercial, dark premium, airy, high-key, low-key; градиенты; colored highlights; tinted shadows; какие цвета нужно сохранить; какие цвета не должны появляться, чтобы не разрушить палитру. Если палитра выглядит фирменной или серийной, опиши reusable color palette.`,
  metaphor: `Извлеки слой Metaphor / Meaning.
Опиши смысл, визуальную метафору и коммуникационную идею изображения.
Нужно извлечь: какие видимые элементы работают как символы; какую идею, процесс, проблему или обещание они передают; бизнес-, продуктовый, эмоциональный или культурный смысл; что изображение обещает зрителю: рост, контроль, скорость, порядок, премиальность, безопасность, автоматизацию, ясность, трансформацию; насколько метафора очевидна; что является наблюдением, а что интерпретацией; как перенести идею без копирования конкретных объектов; какие элементы случайны и не обязательны. Для бизнеса, IT, рекламы и услуг формулируй смысл как communication task для hero-блока, commercial poster или editorial cover.`,
  text: `Извлеки слой Text / Typography / Callouts.
Определи весь видимый текст, надписи, цифры, подписи, кнопки, callouts, UI labels и типографические элементы.
Верни: точное написание всего читаемого текста; язык; регистр; переносы строк; порядок чтения; расположение каждого текстового блока; типографическую иерархию; стиль шрифта; callouts, стрелки, линии, подписи; связь текста с объектами; какие надписи обязательны для генерации; какие лучше добавлять позже как HTML / vector overlay; что плохо читается. Не переводи текст. Если часть плохо читается, помечай как [неразборчиво] или [частично неразборчиво], не выдумывай.`,
};

const outputSchema = `Верни результат строго в такой структуре:

[LAYER_NAME]
Generation-ready description:
...
Uncertainty:
...

Повтори этот блок только для selectedLayers.
Не добавляй никаких других секций после выбранных слоев.
Не добавляй exclusions, negative constraints, routing, summary или комментарии.`;

export function normalizeExtractPresetSelection(input?: ExtractPresetId | ExtractPresetId[]) {
  const raw = Array.isArray(input) ? input : input ? [input] : ['default'];
  const valid = raw.filter((id): id is ExtractPresetId => id === 'default' || allLayerIds.includes(id as ProductionLayerId));
  if (valid.length === 0 || valid.includes('default')) return ['default'] satisfies ExtractPresetId[];

  const unique = Array.from(new Set(valid));
  return allLayerIds.every((id) => unique.includes(id)) ? ['default'] satisfies ExtractPresetId[] : unique;
}

export function getSelectedExtractLayerIds(input?: ExtractPresetId | ExtractPresetId[]) {
  const normalized = normalizeExtractPresetSelection(input);
  return normalized.includes('default') ? allLayerIds : normalized.filter((id): id is ProductionLayerId => id !== 'default');
}

export function buildExtractPrompt(input?: ExtractPresetId | ExtractPresetId[]) {
  const presetIds = normalizeExtractPresetSelection(input);
  const selectedLayers = getSelectedExtractLayerIds(presetIds);
  const unselectedLayers = allLayerIds.filter((id) => !selectedLayers.includes(id));
  const layerTasks = selectedLayers.map((id) => `[${allLayerLabels.get(id)?.toUpperCase()}]\n${selectedLayerTasks[id]}`).join('\n\n');

  return {
    presetIds,
    selectedLayers,
    unselectedLayers,
    systemPrompt: [
      baseExtractContract,
      `selectedLayers: ${selectedLayers.map((id) => allLayerLabels.get(id)).join(', ')}`,
      `unselectedLayers, которые нужно игнорировать и не выводить: ${unselectedLayers.map((id) => allLayerLabels.get(id)).join(', ') || 'none'}`,
      `[SELECTED LAYER TASKS]\n${layerTasks}`,
      outputSchema,
    ].join('\n\n'),
  };
}

export const defaultExtractPrompt = buildExtractPrompt(['default']).systemPrompt;

export const extractPresets: ExtractPreset[] = [
  {
    id: 'default',
    label: 'All Layers',
    prompt: defaultExtractPrompt,
  },
  ...productionLayers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    prompt: buildExtractPrompt([layer.id]).systemPrompt,
  })),
];

export const extractPresetOptions = extractPresets.map((preset) => ({ value: preset.id, label: preset.label }));

export function getExtractPreset(id?: ExtractPresetId) {
  return extractPresets.find((preset) => preset.id === id) ?? extractPresets[0];
}

export function getExtractSelectionLabel(input?: ExtractPresetId | ExtractPresetId[]) {
  const normalized = normalizeExtractPresetSelection(input);
  if (normalized.includes('default')) return 'All Layers';
  if (normalized.length === 1) return allLayerLabels.get(normalized[0] as ProductionLayerId) ?? normalized[0];
  return `${normalized.length} layers`;
}
