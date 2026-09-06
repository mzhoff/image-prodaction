# Каталог нод для Ask AI и QA

Источник истины — типизированный реестр
`src/entities/production-graph/model/node-help.ts`. Он обязан содержать metadata
для каждого `ProductionNodeType`; серверный `node_catalog` добавляет к ней
статические порты реестра, правила динамических портов и разрешённые assistant settings. Этот документ — короткий тестовый индекс,
а не второй независимый реестр.

## Вопрос Ask AI

Для выбранной ноды чат открывается с черновиком, но не отправляет его:

> Расскажи, что такое нода «{label}» (тип {type}) в Image Production, для чего
> она нужна и когда её использовать. Объясни её входы, выходы и ключевые
> настройки, перечисли возможности и ограничения, затем приведи короткий пример
> связки с другими нодами. Используй актуальный node_catalog. Ничего не изменяй
> в текущем документе — нужен только ответ.

Черновик использует только канонические `label` и `type`: данные, настройки и ID
конкретной карточки в него не попадают.

## Полный список 32/32

`server` означает поддержку опубликованным executable runtime, а не просто
наличие кнопки в браузере. `boundary` — внешняя граница pipeline,
`transparent` — прозрачная нода compiler, `canvas-only` — работа только в Studio.

| Type | Label | Для чего нужна | Доступность | Execution |
| --- | --- | --- | --- | --- |
| `importImage` | Import | Загружает изображение или аудио; фактический тип выхода определяется файлом. | addable | boundary |
| `textPrompt` | Text prompt | Собирает текстовый шаблон и подставляет локальные или внешние значения в именованные `@Alias`. | addable | server |
| `textConcat` | Text concat | Склеивает тексты; prefix пока учитывает server runtime, но не Studio preview. | addable | server |
| `textGeneration` | Text generation | Преобразует текст AI-моделью по постоянной instruction. | addable | server |
| `textToSpeech` | Text to speech | Озвучивает текст и отдаёт выбранную дорожку как audio asset. | addable | server |
| `speechToText` | Speech to text | Распознаёт речь в записи и отдаёт текст без разметки говорящих и тайм-кодов. | addable | server |
| `audioConvert` | Audio convert | Готовит MP3/WAV/FLAC/Ogg Opus без AI и отдаёт преобразованное аудио. | addable | server |
| `textFormatter` | Formatter | Редактирует и форматирует текст по preset. | addable | server |
| `textSplitter` | Text splitter | Разбивает текст на коллекцию и отдельные элементы. | addable | server |
| `pipelineInput` | Pipeline input | Объявляет типизированные внешние параметры; text-поле можно явно вставить в Text prompt как `@fieldKey`. | addable | boundary |
| `pipelineOutput` | Pipeline output | Объявляет типизированные результаты, включая подготовленные image/audio artifacts. | addable | boundary |
| `structuredOutput` | Structured output | Преобразует контекст в проверенный JSON по схеме. | addable | server |
| `router` | Router | Прозрачно передаёт значение через именованные порты. | addable | transparent |
| `iterator` | Iterator | Выбирает текущий image/text элемент коллекции. | addable | canvas-only |
| `subjectBuilder` | Subject builder | Собирает паспорт персонажа или объекта. | addable | canvas-only |
| `locationBuilder` | Location builder | Собирает паспорт места и атмосферы. | addable | canvas-only |
| `telegramPublication` | Telegram post | Собирает, проверяет и отдельно отправляет Telegram-пост. | addable | canvas-only |
| `imageToText` | Extract | Анализирует изображение и возвращает редактируемый текст. | addable | server |
| `qrCode` | QR code | Детерминированно создаёт сканируемый PNG QR без AI. | addable | server |
| `referenceComposer` | Reference composer | Собирает prompt из preset-слотов; поверхность не завершена. | hidden-incomplete | canvas-only |
| `composition` | Composition | Собирает до 24 image/text слоёв в изображение. | addable | canvas-only |
| `generateImage` | Generate image | Генерирует изображение по prompt и visual references. | addable | server |
| `sketch` | Sketch | Создаёт вручную нарисованный image source. | addable | canvas-only |
| `cropImage` | Crop | Кадрирует изображение. | addable | canvas-only |
| `adjustment` | Adjustments | Выполняет базовую тоновую и цветовую коррекцию. | addable | canvas-only |
| `curves` | Curves | Корректирует тон и цвет кривыми. | addable | canvas-only |
| `frequencyRetouch` | Frequency retouch | Сглаживает тон, сохраняя текстуру через WebGL. | addable | canvas-only |
| `refineImage` | Refine / Enhance | Generative refine улучшает или очищает изображение. | addable | canvas-only |
| `removeBackground` | Remove BG | Удаляет фон и возвращает PNG с прозрачностью. | addable | canvas-only |
| `exportImage` | Export image | Конвертирует 1–10 изображений; output `image` возвращает преобразованный первый вход. | addable | server |
| `banner` | Banner | Организует canvas визуальным баннером без dataflow. | addable | canvas-only |
| `preview` | Preview | Показывает terminal preview и служит image output boundary. | addable | boundary |

## Критические правила связок

- Для executable text-поля, которое нужно вставить в постоянную инструкцию:
  `pipelineInput.field:<id> -> textPrompt.variable-N -> textPrompt.text`.
  В шаблоне используется `@fieldKey`. Canvas показывает имя source даже когда
  runtime value ещё не известен; значение подставляется при запуске.
- Прямая связь `pipelineInput.field:<id>` с обычным text-входом означает, что
  внешнее значение является всем входом, без постоянного текста вокруг него.
- Для изображения, которое нужно конвертировать до публичного результата:
  `producer.image -> exportImage.image-0 -> exportImage.image ->
  pipelineOutput.field:<id>`. Выход Export — преобразованный первый image, а не
  исходник; batch не имеет отдельного collection-порта на canvas.
- Аудиорежим Import сохраняет технический тип `importImage` и ID выхода `image`,
  но фактический `kind` — `audio`. Не подменяйте тип данными из названия порта.
  Пустая Import не получает аудиосвязь до загрузки записи; `mediaKind` не является
  настраиваемым агентом параметром. Перенос вложений `sourceAttachmentIndex`
  пока работает только для изображений.
- Распознавание: `importImage.image -> speechToText.audio`, затем
  `speechToText.text -> textGeneration.text`. Только текст, без обещаний
  диаризации, тайм-кодов слов или готовых субтитров.
- Озвучка и подготовка файла: `textGeneration.result -> textToSpeech.text`,
  `textToSpeech.audio -> audioConvert.source`, `audioConvert.audio ->
  pipelineOutput.field:<id>` с `kind: audio`. Export image не конвертирует аудио.
- В explicit pipeline загруженная Import сохраняется как managed
  `asset.reference`; в старом неявном режиме остаётся внешней входной границей.
  Аудиофайл приватен, принадлежит Workspace и скачивается по защищённому пути.

Форматы, лимиты и последовательность локальной проверки:
[Аудиопайплайны](../audio-pipelines.md).

## QA каждой ноды

1. Открыть контекстное меню карточки и нажать Ask AI.
2. Проверить, что чат открылся, а вопрос появился только в composer.
3. Проверить канонические `label` и `type` и отсутствие ID/данных карточки.
4. Отправить вопрос и сверить назначение, порты, settings, возможности,
   ограничения и короткий пример с ответом актуального `node_catalog`.
5. Для `referenceComposer` учитывать `hidden-incomplete`; её нельзя создать из
   Add menu. Для `banner` Ask AI объясняет, что нода не участвует в dataflow.
