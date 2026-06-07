# OpenRouter node flow

## Текущая MVP-логика

- `Import` загружает изображение в S3-compatible storage и отдает его как image output с публичной S3-ссылкой.
- `Extract` принимает image input, выбранный preset, редактируемый prompt и выбранную text/vision model. По кнопке `Analyze` отправляет изображение и prompt в `/api/ai/analyze-image`, а ответ сохраняет в `result`.
- `Result` в `Extract` остается редактируемым textarea: пользователь может вручную поправить текст перед передачей дальше по графу.
- Если `Extract` подключен к `Generate Image`, дальше передается именно сохраненный `result`. Повторный анализ автоматически не запускается.
- `Generate Image` принимает ролевые входы `Actors`, `Actions`, `Composition`, `Camera`, `Background / Environment`, `Style`, `Light`, `Color / Grade`, `Metaphor / Meaning`, `Text`. Вход может быть текстом или изображением.
- По кнопке `Generate` узел собирает структурированный prompt, добавляет подключенные image references и вызывает `/api/ai/generate-image`.
- Результат генерации сохраняется как S3 image asset и показывается в preview-плейсхолдере самой ноды.
- Settings и Composing внутри нод сворачиваются. У `Generate Image` базовый сценарий остается простым: prompt, кнопка Generate, затем настройки и продвинутый Composing.

## Синхронизация моделей

Фронт не хранит жесткий список моделей как единственный источник правды. Он запрашивает `/api/ai/models`, а этот route получает актуальный каталог из OpenRouter Models API и оставляет только модели, подходящие под конкретную задачу:

- `analysisModels`: модели с image input и text output.
- `imageModels`: модели с image output.

Для image models дополнительно хранится локальная матрица доступных `aspectRatio` и `size`, потому что эти UI-параметры должны зависеть от выбранной модели.

## Ограничения references

В один `Generate Image` сейчас можно подключить до 4 image references. Если изображение слишком большое, фронт пытается уменьшить его до безопасного размера перед отправкой. Если после сжатия оно все еще слишком большое, пользователь получает предупреждение.

Почему так: пока нет очередей, безопаснее держать лимиты на фронте и в API-route, чтобы случайно не отправлять в OpenRouter слишком тяжелые payloads.
