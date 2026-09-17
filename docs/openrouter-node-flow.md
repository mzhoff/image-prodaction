# OpenRouter node flow

> Статус: этот документ описывает node-level UX и текущие ограничения payload.
> Актуальный переход от глобального key к Workspace credential и отдельному worker
> зафиксирован в
> [workspace-ai-execution-architecture.md](./workspace-ai-execution-architecture.md).

## Текущая MVP-логика

- `Import` хранит только изображение в IndexedDB и отдает его через image output.
- `Extract` принимает image input, выбранный preset, редактируемый prompt и выбранную text/vision model. По кнопке `Analyze` отправляет изображение и prompt в `/api/ai/analyze-image`, а ответ сохраняет в `result`.
- `Result` в `Extract` остается редактируемым textarea: пользователь может вручную поправить текст перед передачей дальше по графу.
- Если `Extract` подключен к `Generate Image`, дальше передается именно сохраненный `result`. Повторный анализ автоматически не запускается.
- `Generate Image` принимает ролевые входы `Actors`, `Actions`, `Composition`, `Camera`, `Background / Environment`, `Style`, `Light`, `Color / Grade`, `Metaphor / Meaning`, `Text`. Вход может быть текстом или изображением.
- По кнопке `Generate` узел собирает структурированный prompt, добавляет подключенные image references и вызывает `/api/ai/generate-image`.
- Запрос сохраняется в очереди Workspace; worker вызывает OpenRouter и сохраняет результат как image asset с usage и настройками генерации. Нода показывает результат и историю.
- Settings и Composing внутри нод сворачиваются. У `Generate Image` базовый сценарий остается простым: prompt, кнопка Generate, затем настройки и продвинутый Composing.

## Синхронизация моделей

Фронт не хранит жесткий список моделей как единственный источник правды. Он запрашивает `/api/ai/models`, а этот route получает актуальный каталог из OpenRouter Models API и оставляет только модели, подходящие под конкретную задачу:

- `analysisModels`: модели с image input и text output.
- `imageModels`: прежний совместимый список для Refine и отдельного редактора маски.
- `generationModels`: прежние модели плюс актуальные растровые модели из OpenRouter `/images/models`; используется Generate Image, с логотипами семейств.

Старые ID сохраняют локальную матрицу и вызов Chat Completions. Новые ID используют
`POST /images` на OpenRouter: prompt, input_references, n=1 и только поддержанные
aspect_ratio, resolution, quality, background, output_format, output_compression,
seed. В графе последние пять опций имеют имена imageQuality, imageBackground,
imageFormat, imageCompression, imageSeed. Отсутствующий resolution представлен
как size=auto и не передаётся провайдеру. Необъявленные параметры не добавляются.
Каталог кешируется на сервере на 5 минут. Перед оплатой проверяется endpoint,
поддерживающий всё сочетание настроек, и при наличии provider_tag запрос
закрепляется за ним без fallback. Источник: [OpenRouter Images API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation).

SVG-only модели исключены; результат — PNG/JPEG/WebP. Модели не подменяются при
сбое каталога. Новые опции сохраняются в очереди, metadata результата и pinned
runtime config; usage берётся из ответа OpenRouter. Неизвестный исход после
отправки блокирует автоматический повтор; HTTP-ошибки используют общий recovery.

## Ограничения references

В один `Generate Image` можно подключить до четырёх image references, с учётом
более строгого минимума/максимума модели. Разрешение автоматически не уменьшается.
Для Gemini сервер пробует WebP без потерь, оставляя исходник, если он меньше.
Весь JSON ограничен 30 МиБ; для Gemini inline запрос дополнительно ограничен
20 МБ после подготовки. Превышение лимита требует уменьшить вес/число файлов.

Лимиты проверяются и на фронте, и в API, чтобы случайно не отправлять провайдеру
слишком тяжелый payload. После появления worker серверная проверка остается
обязательной, а frontend validation служит быстрым UX feedback.
