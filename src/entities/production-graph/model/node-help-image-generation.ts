import type { ProductionNodeHelpMap } from './node-help-types';

export const imageGenerationNodeHelp = {
  importImage: {
    aliases: ['image input', 'upload image', 'reference image', 'импорт изображения', 'входное изображение', 'референс'],
    availability: 'addable',
    capabilities: [
      'Хранит загруженное изображение как asset и отдаёт его в граф.',
      'Может материализовать attachment после подтверждения assistant proposal.',
      'Служит исходником обработки или visual reference.',
    ],
    execution: 'boundary',
    limitations: [
      'Не обрабатывает и не генерирует изображение.',
      'Входов нет; sourceAttachmentIndex относится к assistant proposal, а не к settings ноды.',
      'Для уже приложенного файла proposal указывает sourceAttachmentIndex; для пустой ноды, которую пользователь заполнит позже, индекс не передаётся.',
    ],
    portRules: [
      'Выход image имеет kind image и подключается к image, reference или any-входу.',
      'В неявном executable pipeline Import image становится входной границей, собственного server handler нет.',
    ],
    summary: 'Добавляет загруженное изображение как исходный asset и отдаёт его в граф.',
  },
  imageToText: {
    aliases: ['extract', 'image to text', 'vision analysis', 'анализ изображения', 'описание изображения', 'извлечение'],
    availability: 'addable',
    capabilities: [
      'Анализирует изображение по выбранным model, preset и custom prompt.',
      'Даёт редактируемый rich-text результат, layer tags и фильтрацию секций.',
      'Исполняется на сервере как ai.image.analyze.',
    ],
    execution: 'server',
    limitations: [
      'Принимает одно изображение и вызывает внешнюю модель.',
      'Качество зависит от модели и prompt; результат нужно проверять, это не гарантия детерминированного OCR.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает text.'],
    summary: 'Анализирует входное изображение моделью по preset и prompt и возвращает редактируемый текст.',
  },
  qrCode: {
    aliases: ['qr', 'qr code', 'qr-code', 'qr generator', 'qr-код', 'куар-код', 'генератор qr-кода'],
    availability: 'addable',
    capabilities: [
      'Детерминированно кодирует локальный или подключённый URL или текст без AI.',
      'Поддерживает contentMode URL/text и server handler image.qr.generate.',
      'Может быть отдельным функциональным image-layer в Composition.',
    ],
    execution: 'server',
    limitations: [
      'Подключённый text имеет приоритет над локальным content; пустое значение не даёт полезного QR.',
      'Контент ограничен 2048 UTF-8 bytes и не допускает управляющие символы; URL mode принимает только абсолютный HTTP/HTTPS URL без credentials.',
      'V1 использует product-owned PNG 1024x1024, correction M, margin 4 и чёрно-белые цвета; JPEG/SVG не поддерживаются assistant contract.',
      'Функциональный QR нельзя заменять визуальной AI-имитацией через Generate image.',
      'Если URL не дан, ассистент не спрашивает и не выдумывает бизнес-ссылку: оставляет локально редактируемый content пустым и объясняет, что его нужно заполнить.',
    ],
    portRules: [
      'Вход text принимает URL или text; выход image возвращает QR image.',
      'Для явно запрошенного executable URL используется Pipeline input field { id: target-url, key: targetUrl, kind: text, required: true } и связь field:target-url -> qrCode.text.',
      'Для многослойного макета qrCode.image подключается как image source Composition.',
      'Обычный редактируемый canvas-макет не требует Pipeline input/output; границы добавляются только по явному запросу на executable или внешний запуск.',
    ],
    summary: 'Создаёт настоящий сканируемый PNG QR-код из URL или текста без AI-генерации.',
  },
  referenceComposer: {
    aliases: ['reference composer', 'preset prompt', 'prompt composer', 'компоновщик референсов', 'сборщик промпта', 'пресеты'],
    availability: 'hidden-incomplete',
    capabilities: [
      'Показывает readonly prompt и десять зарезервированных тематических preset-слотов.',
      'Позволяет менять model, aspect ratio и size у уже сохранённой ноды.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Это единственный зарегистрированный тип, которого нет в меню добавления.',
      'Кнопки preset-слотов и Generate не имеют действий, prompt не пересобирается; server runtime descriptor отсутствует.',
      'Нельзя обещать создание этой ноды через palette или рабочую генерацию.',
    ],
    portRules: [
      'Входы actors, actions, composition, camera, background, style, light, color, metaphor и text принимают preset.',
      'Выход prompt возвращает text.',
    ],
    summary: 'Зарезервированная скрытая поверхность prompt composer; слоты и генерация пока не работают.',
  },
  composition: {
    aliases: ['layers', 'composite', 'layer composition', 'композиция', 'слои', 'сборка слоёв'],
    availability: 'addable',
    capabilities: [
      'Собирает до 24 image и native text layers с управляемыми layout и z-order.',
      'Поддерживает aspect ratio, canvas size и редактируемые текстовые слои.',
      'Assistant compositionBlueprints переводит semantic layout в реальные layer-N.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Server handler executable Composition отсутствует.',
      'Studio начинает с двух свободных layer-слотов, но это не требование иметь две подключённые связи.',
      'layer-N задаёт исходный порядок; после ручной перестановки фактический z-order хранится в layerOrder и groups.',
      'Порты layer-N имеют kind any, но renderer создаёт содержимое только из image и text; другие виды источников дадут пустой слой.',
      'Для обычного canvas-макета не нужны Pipeline input/output без явного запроса на executable pipeline.',
      'Публикация многослойного рецепта как межпродуктового контракта является отдельным этапом.',
    ],
    portRules: [
      'Динамические входы layer-0..layer-23 имеют kind any и принимают по одной связи; выход image возвращает композицию.',
      'textPrompt.text или textGeneration.result создают text layer; image-выходы создают image layer.',
      'В простом рекламном макете общий Generate image может дать основной арт, QR code остаётся отдельным функциональным слоем, а финал обычно идёт composition.image -> exportImage.image-0.',
    ],
    summary: 'Собирает image и text источники в одно редактируемое многослойное изображение без AI-генерации.',
  },
  generateImage: {
    aliases: ['image generation', 'generator', 'генерация изображения', 'генератор изображения'],
    availability: 'addable',
    capabilities: [
      'Генерирует изображение по prompt и/или references с model, aspect ratio и size и хранит историю результатов.',
      'Принимает общий image reference и специализированные semantic references.',
      'Исполняется на сервере как ai.image.generate.',
    ],
    execution: 'server',
    limitations: [
      'Вызывает провайдера; результат недетерминирован и референсы могут быть переинтерпретированы.',
      'Можно оставить prompt пустым: тогда Studio строит базовую задачу из subject, location и image references.',
      'Studio принимает до четырёх уникальных image sources; executable runtime берёт первые четыре incoming image bindings и молча отбрасывает остальные.',
      'Нельзя использовать для функционального QR-кода.',
      'Semantic references работают в Studio; Subject, Location и Reference composer не имеют runtime descriptor и как source nodes не компилируются в executable pipeline.',
    ],
    portRules: [
      'Входы prompt:text и reference:image дополняются actors, actions, composition, camera, background, style, light, color, metaphor и text с kind reference; выход image возвращает image.',
      'Subject разрешён только во вход actors, Location — только в background; остальные reference-входы принимают text, image или preset.',
    ],
    summary: 'Генерирует изображение по prompt и/или общим и semantic references.',
  },
  sketch: {
    aliases: ['sketch', 'draw', 'drawing', 'эскиз', 'рисунок', 'скетч'],
    availability: 'addable',
    capabilities: [
      'Открывает локальный или полноэкранный редактор с настройками цвета и размера кисти.',
      'Сохраняет нарисованный asset, который можно использовать как image или reference source.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Это ручной источник без входов, а не AI-генерация.',
      'Серверного исполнителя executable pipeline нет.',
    ],
    portRules: ['Входов нет; выход image возвращает нарисованное изображение.'],
    summary: 'Создаёт вручную нарисованный источник изображения выбранного aspect ratio.',
  },
} satisfies ProductionNodeHelpMap<
  'importImage' | 'imageToText' | 'qrCode' | 'referenceComposer' | 'composition' | 'generateImage' | 'sketch'
>;
