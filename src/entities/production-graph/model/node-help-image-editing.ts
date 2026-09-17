import type { ProductionNodeHelpMap } from './node-help-types';

export const imageEditingNodeHelp = {
  cropImage: {
    aliases: ['crop', 'crop image', 'crop video', 'framing', 'кадрирование', 'обрезка', 'кроп', 'обрезка видео'],
    availability: 'addable',
    capabilities: [
      'Кадрирует изображение или видео по рамке, preset aspect ratio (например 9:16) или pixel dimensions.',
      'Поддерживает блокировку пропорций и reset. Видео обрабатывается кнопкой «Обрезать видео»; изменение рамки не запускает обработку на каждом движении.',
      'Сохраняет отдельный derived asset. Видео-кроп выполняется на сервере также в опубликованном Pipeline; image-кроп остаётся в канвасе.',
    ],
    execution: 'server',
    limitations: [
      'Требует ровно один источник: изображение либо видео. Новый вход другого типа заменяет предыдущий; неоднозначный граф с обоими входами не выполняется.',
      'Обрезает пространство кадра, не длительность. Не выполняет generative outpaint; исходный файл сохраняется.',
      'После смены видео или рамки прежний videoResult недоступен до применения обработки. Image-вариант не исполняется в server runtime.',
    ],
    portRules: [
      'Вход image принимает image; выход result возвращает обрезанный image. Вход video принимает video; выход videoResult возвращает обрезанный video.',
      'Пример: generateVideo.video -> cropImage.video, затем cropImage.videoResult -> reverieStories.video. Video можно подключить через Router и другие Crop.',
      'Настройки MCP: title, aspectRatio, crop:{x,y,width,height} — нормализованная рамка 0..1 внутри кадра. Фиксированный aspectRatio вписывает рамку в формат с сохранением начала; Custom сохраняет точную рамку. Данные результата не являются настройками.',
    ],
    summary: 'Кадрирует одно изображение или видео по рамке и формату, сохраняя исходный файл.',
  },
  adjustment: {
    aliases: ['adjustments', 'image adjustments', 'exposure contrast', 'коррекция изображения', 'настройки изображения', 'экспозиция'],
    availability: 'addable',
    capabilities: [
      'Регулирует exposure, gamma, contrast, saturation, temperature, tint, highlights и shadows.',
      'Показывает live preview, поддерживает reset и создаёт derived image asset.',
      'Открывается кликом по изображению или кнопкой Open image: в полном окне ползунки находятся справа, на узком экране — в прокручиваемой панели снизу. Настройки общие с нодой.',
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
      'В полном окне кривые находятся справа от изображения и не уменьшают его доступную высоту; инструменты маски остаются снизу. На узком экране цветокоррекция переносится в прокручиваемую нижнюю панель.',
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
      'Поле instruction в Studio принимает текстовый фрагмент за бейдж над полем с добавлением снизу; выделение можно перенести на канвас, Alt копирует. Перенос текста не запускает обработку изображения.',
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
      'Возвращает преобразованный первый image-вход через output image для продолжения dataflow.',
      'В Studio показывает все подключённые изображения и варианты через стрелки на hover, со счётчиком текущего файла; просмотр учитывает настройки экспорта.',
      'Download ZIP выгружает весь набор; Download image и Save current to Library работают с выбранным в просмотре изображением.',
      'Основная кнопка Download/Download ZIP называет архив и скачиваемые файлы по текущему title Export-ноды, добавляя дату-время UTC, новый ID скачивания и порядковый номер файла. Переименование учитывается со следующего скачивания.',
      'Исполняется на сервере как image.export.',
    ],
    execution: 'server',
    limitations: [
      'Первый подключённый image, обычно image-0, автоматически готовит преобразованный output для dataflow; Download и Save current to Library остаются отдельными действиями пользователя.',
      'В Studio один source с локальной history может раскрыться более чем в десять файлов; executable runtime обрабатывает до 10 scalar image bindings.',
      'Downstream output image представляет только первый преобразованный подключённый image; batch остаётся доступен для download/runtime collection, но не имеет отдельного canvas collection-порта.',
      'Перелистывание — локальное состояние просмотра Studio: не меняет выход image, соединения, историю Undo или серверное исполнение и не является MCP setting.',
      'Имена скачивания относятся только к основной кнопке Studio: не переименовывают исходники в Library, output-артефакты или файлы серверного runtime. Недопустимые символы title заменяются, слишком длинные названия сокращаются.',
      'quality применяется только к JPEG/WebP; PNG её игнорирует, а transparent background для JPEG заменяется белым.',
    ],
    portRules: [
      'Динамические входы image-0..image-9 принимают image; фиксированный output image возвращает первый преобразованный подключённый image (обычно image-0).',
      'Для одного результата обычно подключают composition.image или generateImage.image к image-0.',
      'Для публичного готового артефакта подключите exportImage.image к image-полю Pipeline Output.',
    ],
    summary: 'Преобразует и экспортирует изображения, а первый готовый подключённый image возвращает дальше как финальный image artifact.',
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
