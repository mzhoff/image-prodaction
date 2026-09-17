# Визуальная идентификация нод

Все 33 типа используют один `NODE_ICONS` / `NodeIcon` из entity UI. Заголовок
и пункты создания ноды показывают одинаковый знак независимо от пользовательского
названия. Палитра, избранное и connect-create наследуют его из общего меню.
Banner без заголовка показывает знак в пустом состоянии; изображение загруженного
баннера не перекрывается служебной иконкой. Форматы публикаций, ещё не являющиеся
доступными типами нод, не входят в этот реестр.

Иконки — существующие публичные экспорты `@prodactionpro/ui-core/icons`
(Hugeicons). Локальной копии библиотеки и переопределения её glyphs нет.
Доступное имя остаётся текстом; SVG декоративный и не дублирует его для screen reader.

| Тип | Символ | Экспорт UI |
| --- | --- | --- |
| importImage | Загрузка | Upload |
| textPrompt | Текстовый ввод | TextCursorInput |
| textConcat | Список с плюсом | ListPlus |
| textGeneration | AI-ассистент | Bot |
| textFormatter | Текст / форматирование | Text |
| textSplitter | Ножницы | Scissors |
| textToSpeech | Динамик | Volume2 |
| speechToText | Микрофон | Mic |
| audioConvert | Звуковая волна | AudioLines |
| timelineHandoff | Монтажная плёнка | Film |
| pipelineInput | Входящий файл | FileInput |
| pipelineOutput | Исходящий файл | FileOutput |
| structuredOutput | JSON-файл | FileJson |
| router | Развилка | Route |
| iterator | Цикл | Repeat2 |
| subjectBuilder | Отпечаток | Fingerprint |
| locationBuilder | Метка места | MapPin |
| telegramPublication | Отправка | Send |
| imageToText | Сканирование | Scan |
| qrCode | QR-код | QrCode |
| referenceComposer | Смешение | Blend |
| composition | Слои | Layers |
| generateImage | Изображение с плюсом | ImagePlus |
| sketch | Карандаш | PencilLine |
| cropImage | Рамка обрезки | Crop |
| adjustment | Регуляторы | SlidersHorizontal |
| curves | График | TrendingUp |
| frequencyRetouch | Кисть | Brush |
| refineImage | Волшебная палочка | WandSparkles |
| removeBackground | Ластик | Eraser |
| exportImage | Скачивание | Download |
| banner | Панель | PanelsTopLeft |
| preview | Глаз | Eye |

## Поля текста

`PromptBox` остаётся адаптером общего `TextareaControl`. Ширину и отступы задаёт
контейнер ноды: у полноширинных полей 100%, у inset-полей Text Gen/Concat ширина
уменьшена на сумму боковых отступов. Тема не переопределяет эту геометрию.
Box sizing учитывает padding/border, минимальная ширина допускает сжатие;
resize остаётся только вертикальным. Контент и outline не обрезаются через
overflow:hidden на карточке, порты сохраняют возможность выходить за её границы.

Регрессия: уникальная геометрия всех glyphs (`node-icon.test.ts`), browser QA
полей всех типов в обеих темах, фокус/изменение высоты, одинаковые иконки в
карточках/меню/палитре и сохранение иконки после rename (`node-visual-contract.spec.ts`).
Порты, настройки, исполнительный runtime и семантика AI-запросов не изменены.

## Проверенная поставка 2026-09-10

- До исправления браузерный тест воспроизвёл переполнение в семи полях:
  Text Gen, Concat, Speech to Text, Subject и Location.
- `npm test`: 875 tests — 865 passed, 10 skipped, 0 failed.
- Typecheck, lint, architecture (1267 файлов), Reverie CSS/token guard и
  `git diff --check` прошли. Новых зависимостей нет, версия UI-пакетов не менялась.
- На пересобранном web прошли 5 Chrome E2E: два теста визуального контракта
  (включая все 33 типа в избранном), batch connect, Export carousel и Reverie theme.
  Тесты используют отдельные локальные QA-профили; AI-запросы заблокированы.
- Стабильный `image-prodaction-web:codex-local` обновлён до image ID
  `sha256:3868662aa66b40618cf821daa92699a4f5e16676bfb6747a472f393ee935b1e2`.
  Пересоздавался только web с integration/private-packages overlays.
- `/api/health/ready` на 3004 и 7310 — HTTP 200; из Content Hub также HTTP 200.
  Runtime v2: 1 соединение проверено, 7 grants, 5 pipelines. Базы, volumes,
  workers, credentials и пользовательские графы не изменялись.
- После завершения build-процессов удалён только Docker build cache (4.51 GB).
  Свободное место по `df`: до задачи 62 GiB, перед очисткой 59 GiB, после 64 GiB.
  Кэш уменьшился до 34.3 MB; образы суммарно занимают 52.84 GB, как до задачи.
  Образы, контейнеры, volumes, базы и пользовательские файлы не удалялись.

Прежнее NFT warning в Next и известные замечания `npm audit` не относятся к
этой визуальной правке и сохраняются; см. [исходную поставку UI](./reverie-ui-release-2026-09-10.md).
