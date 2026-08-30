import type { ProductionNodeHelpMap } from './node-help-types';

export const imageEditingNodeHelp = {
  cropImage: {
    aliases: ['crop', 'crop image', 'framing', 'кадрирование', 'обрезка', 'кроп'],
    availability: 'addable',
    capabilities: [
      'Интерактивно кадрирует изображение по рамке, preset aspect ratio или pixel dimensions.',
      'Поддерживает блокировку пропорций, reset и сохраняет derived image asset.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Требует одно исходное изображение.',
      'Выполняет raster crop, но не generative outpaint; server runtime descriptor отсутствует.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает обрезанный image.'],
    summary: 'Кадрирует одно входное изображение по рамке, aspect ratio или pixel dimensions.',
  },
  adjustment: {
    aliases: ['adjustments', 'image adjustments', 'exposure contrast', 'коррекция изображения', 'настройки изображения', 'экспозиция'],
    availability: 'addable',
    capabilities: [
      'Регулирует exposure, gamma, contrast, saturation, temperature, tint, highlights и shadows.',
      'Показывает live preview, поддерживает reset и создаёт derived image asset.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Локальные параметры ограничены диапазоном от -100 до 100.',
      'Это browser raster processing, а не semantic или generative edit; server runtime descriptor отсутствует.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает скорректированный image.'],
    summary: 'Применяет базовую тоновую и цветовую коррекцию к одному изображению.',
  },
  curves: {
    aliases: ['curves', 'tone curves', 'rgb curves', 'кривые', 'тоновые кривые', 'цветовые кривые'],
    availability: 'addable',
    capabilities: [
      'Редактирует master и цветовые каналы draggable-точками на кривой.',
      'Показывает histogram, поддерживает opacity, optional mask и reset.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Требует исходное изображение и выполняется локально в браузере.',
      'Это не AI-редактирование; server runtime descriptor отсутствует.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает скорректированный image.'],
    summary: 'Выполняет тоновую и цветовую коррекцию изображения кривыми.',
  },
  frequencyRetouch: {
    aliases: ['frequency retouch', 'frequency separation', 'skin retouch', 'частотная ретушь', 'частотное разложение', 'ретушь кожи'],
    availability: 'addable',
    capabilities: [
      'WebGL frequency separation сглаживает тон и возвращает текстуру из оригинала.',
      'Настраивает radius 2..32, tone smoothing 0..100, texture 0..140 и redness reduction 0..100.',
      'Поддерживает mask, live result и reset.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Зависит от WebGL и производительности браузера.',
      'Может давать артефакты и требует визуальной проверки; server runtime descriptor отсутствует.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает отретушированный image.'],
    summary: 'Сглаживает тон и сохраняет текстуру методом WebGL frequency separation.',
  },
  refineImage: {
    aliases: ['refine', 'enhance', 'image cleanup', 'upscale detail', 'улучшение изображения', 'очистка изображения', 'детализация'],
    availability: 'addable',
    capabilities: [
      'Generative refine улучшает, очищает или детализирует изображение по instruction.',
      'Поддерживает mode, preserve strength, model, size и историю результатов.',
      'Хранит метаданные исходника, aspect ratio и output.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Требует исходное изображение и внешний provider/model call.',
      'Даже при preserve может перерисовать детали; executable server handler отсутствует.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает улучшенный image.'],
    summary: 'Generative refine улучшает, очищает или детализирует входное изображение по instruction.',
  },
  removeBackground: {
    aliases: ['remove bg', 'remove background', 'background removal', 'удалить фон', 'удаление фона', 'вырезать фон'],
    availability: 'addable',
    capabilities: [
      'Вызывает product action удаления фона и сохраняет derived result с alpha channel.',
      'Текущий интерфейс использует FAL · Bria RMBG 2.0 и PNG-результат.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Требует исходное изображение и внешний provider action.',
      'Качество маски нужно проверять; executable server handler отсутствует.',
    ],
    portRules: ['Вход image принимает image; выход result возвращает PNG image с прозрачностью.'],
    summary: 'Удаляет фон изображения и возвращает PNG с прозрачностью.',
  },
  exportImage: {
    aliases: ['image output', 'export', 'экспорт изображения', 'выход изображения'],
    availability: 'addable',
    capabilities: [
      'Предоставляет от 1 до 10 image-входов и экспортирует PNG, JPEG или WebP.',
      'Настраивает quality, scale 1/0.75/0.5/0.25 и transparent/white/black background.',
      'Исполняется на сервере как image.export.',
    ],
    execution: 'server',
    limitations: [
      'Выходных портов нет.',
      'Создание ноды не запускает download или export: требуется отдельное действие пользователя.',
      'В Studio один source с локальной history может раскрыться более чем в десять файлов; executable runtime обрабатывает до 10 scalar image bindings.',
      'quality применяется только к JPEG/WebP; PNG её игнорирует, а transparent background для JPEG заменяется белым.',
    ],
    portRules: [
      'Динамические входы image-0..image-9 принимают image; выходов нет.',
      'Для одного результата обычно подключают composition.image или generateImage.image к image-0.',
    ],
    summary: 'Экспортирует одно или несколько изображений с настройками формата, качества, масштаба и фона.',
  },
  banner: {
    aliases: ['banner', 'canvas banner', 'divider', 'баннер', 'разделитель', 'подложка'],
    availability: 'addable',
    capabilities: [
      'Размещает на canvas загружаемое изображение для визуальной организации графа.',
      'Поддерживает resize рамки, lock и delete.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Не участвует в dataflow и не имеет server handler.',
      'Размер рамки ограничен 120..1200 по ширине и 48..800 по высоте.',
    ],
    portRules: ['Входных и выходных портов нет.'],
    summary: 'Размещает на canvas загружаемый и масштабируемый визуальный баннер или разделитель.',
  },
  preview: {
    aliases: ['preview', 'image preview', 'sink', 'предпросмотр', 'просмотр результата', 'финальный просмотр'],
    availability: 'addable',
    capabilities: [
      'Показывает входящий или текущий image asset как terminal preview.',
      'Compiler распознаёт Preview как sink и находит upstream leaf output.',
    ],
    execution: 'boundary',
    limitations: [
      'Не изменяет изображение и не экспортирует файл.',
      'Выходного порта и собственного server runtime handler нет.',
    ],
    portRules: ['Вход image принимает image; выходных портов нет.'],
    summary: 'Показывает подключённое изображение как terminal preview без отдельного экспорта.',
  },
} satisfies ProductionNodeHelpMap<
  'cropImage' | 'adjustment' | 'curves' | 'frequencyRetouch' | 'refineImage'
  | 'removeBackground' | 'exportImage' | 'banner' | 'preview'
>;
