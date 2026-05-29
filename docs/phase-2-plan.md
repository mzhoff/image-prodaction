# Reverie Image Production Pipeline: phase 2 plan

Дата: 2026-05-29

## 1. Контекст

Первый MVP подтвердил жизнеспособность продукта: нодовый граф работает, изображения можно загружать, анализировать, генерировать и передавать между узлами. Второй этап нужен не для переписывания MVP, а для усиления production-функций, которые делают инструмент ближе к реальной работе с ассетами.

Фокус этапа 2:

- обтравка фона и получение alpha / mask;
- история генераций внутри каждой image-generation ноды;
- просмотр и переключение версий в карточке и fullscreen view;
- рисование маски в fullscreen view;
- inpaint / masked edit: перегенерация выделенной области изображения;
- ручные эскизы композиции как image reference для generation nodes;
- экспорт ассетов в нужный формат, размер и качество.

## 2. Background removal / cutout

### Задача

Пользователь должен получить изображение без фона в прозрачном PNG/WebP и, желательно, отдельную mask-картинку. Это нужно для композитинга: герой, продукт или объект становится отдельным слоем.

### MVP-функция

Добавить новый узел `Cutout / Mask`:

- вход: image;
- выходы: transparent image и mask;
- кнопка `Cutout`;
- preview на checkerboard background;
- download transparent PNG;
- optional mask preview.

### Провайдеры для теста

Первый тестовый провайдер: `fal.ai/birefnet/v2`.

Второй тестовый провайдер: Replicate. Модели для сравнения:

- `recraft-ai/recraft-remove-background`: ожидаемо хороший production candidate, около $0.01/image;
- `bria/remove-background`: дороже, но сильный e-commerce / portrait candidate, около $0.018/image;
- `851-labs/background-remover`: очень дешевый baseline, качество нужно проверять отдельно.

На фронте не привязываемся к конкретному API. Делаем server route:

- `POST /api/ai/remove-background`

И общий provider interface:

```ts
type RemoveBackgroundProvider = "fal-birefnet" | "replicate-recraft" | "replicate-bria" | "replicate-851";
```

В `.env.example` добавить:

```env
FAL_API_KEY=
REPLICATE_API_TOKEN=
BACKGROUND_REMOVAL_PROVIDER=fal-birefnet
```

После ответа API проверяем:

- файл действительно PNG/WebP с alpha channel;
- есть прозрачные пиксели, а не просто checkerboard, нарисованный в изображении;
- размер результата не потерялся критично;
- если provider вернул mask, сохраняем ее отдельно.

Если alpha нет, показываем ошибку и не заменяем текущий image output.

## 3. Image generation history

Каждая image-generation нода должна хранить историю генераций. На канвасе показывается одна активная версия, именно она передается дальше по графу.

При каждом успешном `Generate`:

- новая картинка добавляется в `history`;
- новая версия становится активной;
- старая версия не удаляется;
- связи из этой ноды используют активную версию.

В карточке ноды:

- по hover на image preview появляются текущие кнопки download / maximize;
- слева снизу появляются стрелки назад / вперед;
- справа снизу появляется счетчик версии: `1/3`, `2/4` и т.д.;
- если версия одна, стрелки можно скрыть или disable.

В fullscreen view:

- те же версии можно листать стрелками влево / вправо;
- активная версия синхронизируется с нодой;
- download скачивает текущую активную версию.

Предлагаемая модель:

```ts
type ImageVersion = {
  id: string;
  assetId: string;
  createdAt: string;
  provider: string;
  model: string;
  prompt: string;
  inputSnapshot: unknown;
  costUsd?: number;
};
```

В `GenerateImageNodeData` добавить `imageHistory: ImageVersion[]` и `activeImageVersionId?: string`. Изображения остаются в IndexedDB, а граф хранит только metadata и `assetId`.

## 4. Fullscreen mask editor

В fullscreen режиме пользователь должен рисовать область, которую хочет изменить. Маска должна использоваться для удаления, замены или перегенерации части изображения.

В fullscreen image view добавить режим `Mask`:

- brush;
- eraser;
- brush size;
- clear mask;
- invert mask later, не обязательно в первой версии;
- opacity overlay;
- prompt для masked edit;
- кнопка `Regenerate selected area`.

Технически fullscreen view должен иметь два canvas layer:

- image layer: исходное изображение;
- mask layer: пользовательская маска.

При отправке в API создаем PNG mask того же размера, что и исходное изображение.

### Общий drawing engine

Маски и ручные эскизы не должны быть двумя разными редакторами. Нужен один простой drawing engine с разными режимами экспорта:

- `mask`: пользователь видит цветной overlay, а экспорт получает alpha mask;
- `sketch`: пользователь рисует на белом листе, а экспорт получает обычное изображение-reference.

Первую версию лучше делать на native `<canvas>` и Pointer Events, без тяжелого редактора. Если кисть будет выглядеть грубо, можно добавить `perfect-freehand`.

Базовые инструменты:

- brush;
- eraser;
- brush size;
- eraser size;
- 1-3 быстрых цвета;
- custom/random color;
- clear;

## 5. Hand sketch / composition reference

Пользователь должен иметь возможность быстро нарисовать эскиз композиции: где будут объекты, какой общий баланс кадра, крупность и расположение элементов. Это не художественный редактор, а способ передать генеративной модели spatial intent.

Добавить простой `Sketch` node:

- белый лист с фиксируемым aspect ratio;
- простая палитра цветов;
- кисть и ластик с изменяемым размером;
- кнопка clear;
- preview эскиза в карточке;
- image output port.

`Sketch` node отдает image output. Для генерации композиции пользователь соединяет его с входом `Composition` у `Generate Image`.

Логика prompt assembly:

- если `Composition` получает текст, используем его как текстовое описание композиции;
- если `Composition` получает image/sketch, передаем его как composition reference image;
- если есть и текст, и sketch, передаем оба: текст как instruction, sketch как visual layout reference.

Важно: это должно работать через тот же image-reference механизм, что и Import / Generate Image outputs, без отдельной логики только для Sketch.

## 6. Masked edit / inpaint research

### Что подтверждено документацией

OpenAI Image API поддерживает `images.edit` с `image`, `mask` и `prompt`. У маски есть требования:

- mask и image должны быть одного размера и формата;
- размер файла меньше 50MB;
- mask должна содержать alpha channel;
- маска является prompt-based guidance, модель может не повторить форму пиксель-в-пиксель.

OpenRouter image generation сейчас документирован через Chat Completions и Responses endpoints. Также OpenRouter OpenAPI schema содержит `input_image_mask` в конфигурации image generation tool, но публичный гайд по image generation не описывает полноценный mask-edit workflow как отдельный стабильный контракт.

### Вывод

Это гипотеза этапа 2, которую нужно проверить отдельным technical spike:

1. Проверить OpenRouter Responses API + `image_generation` / `input_image_mask`.
2. Проверить OpenRouter server tool `openrouter:image_generation` с передачей mask-параметров.
3. Если OpenRouter не дает стабильный mask-edit, подключить прямой OpenAI Image API как отдельный optional provider для inpaint.

Важно: это не ломает текущую архитектуру. У нас будет не "OpenRouter-only" реализация, а provider layer для image operations.

Если гипотеза не подтвердится, оставляем mask editor как подготовленный UI/asset layer и ограничиваем функцию: отключаем masked edit, включаем его только для подтвержденных providers или явно показываем пользователю, что это не pixel-perfect edit, а generative guidance.

## 7. Export node

Сейчас пользователь может скачать изображение из preview, но production-сценарий требует контролируемый экспорт. Нужна отдельная нода, которая получает image input и готовит файл в нужном формате.

Добавить `Export` node:

- вход: image;
- preview активного изображения;
- format: `png`, `jpeg`, `webp`;
- quality/compression для `jpeg` и `webp`;
- resize: original, width, height, scale;
- preserve alpha для PNG/WebP, если вход содержит прозрачность;
- estimated file size, если это не усложнит MVP;
- кнопка `Download`.

Конвертацию делаем в браузере через Canvas / Blob, без server route. Если вход имеет alpha, а пользователь выбирает JPEG, показываем предупреждение, что прозрачность будет заменена фоном. Позже можно добавить background color selector.

## 8. Предлагаемый порядок реализации

### Iteration 2.1: Cutout node

- Добавить `mask` port type.
- Добавить `Cutout / Mask` node.
- Добавить `remove-background` API route.
- Подключить fal.ai BiRefNet.
- Подключить один Replicate provider.
- Сделать alpha validation.
- Сохранить transparent image и mask в IndexedDB.

### Iteration 2.2: Image version history

- Расширить модель image-generation нод.
- Добавить append history on generate.
- Сделать arrows + counter на image preview.
- Сделать версионность в fullscreen view.
- Убедиться, что downstream nodes получают активную версию.

### Iteration 2.3: Shared drawing engine

- Расширить fullscreen view до editor mode.
- Реализовать brush / eraser / size / clear.
- Экспортировать mask PNG в исходном размере.
- Сохранять draft mask локально до закрытия view.
- Подготовить sketch export как обычный image asset.

### Iteration 2.4: Sketch node

- Добавить `Sketch` node.
- Добавить белый canvas с aspect ratio.
- Добавить палитру, brush size и eraser size.
- Подключить image output к `Composition` input.
- Проверить generation по sketch + prompt.

### Iteration 2.5: Masked edit provider spike

- Проверить OpenRouter mask flow.
- Проверить direct OpenAI Image API fallback.
- Зафиксировать качество, стоимость и ограничения.
- После выбора provider добавить `Regenerate selected area`.

### Iteration 2.6: Export node

- Добавить `Export` node.
- Поддержать PNG/JPEG/WebP.
- Добавить quality и resize controls.
- Сохранять alpha для PNG/WebP.
- Делать download готового файла.

## 9. Риски

- OpenRouter может не поддерживать mask-edit достаточно стабильно через публичный API.
- GPT Image mask editing не является строго пиксель-точным inpaint, это guidance для модели.
- Transparent output и background removal - разные задачи. Для надежной обтравки лучше отдельный cutout provider.
- История изображений увеличит объем IndexedDB, нужен лимит версий на ноду.
- Маски нужно хранить в исходном размере изображения, иначе edit API даст ошибку или плохой результат.
- Sketch reference может трактоваться моделью слишком буквально или слишком свободно, это нужно проверять на разных providers.
- Browser export через Canvas может терять metadata, color profile и EXIF, это нормально для MVP, но важно для production.

## 10. Acceptance criteria

- Пользователь может удалить фон через `Cutout / Mask` и скачать прозрачный PNG.
- Можно сравнить fal.ai и Replicate на одинаковых изображениях.
- Generate Image node хранит несколько версий и позволяет переключать активную.
- Активная версия передается дальше по графу.
- Fullscreen view умеет листать версии.
- Fullscreen view умеет рисовать маску и экспортировать ее как PNG.
- Sketch node позволяет нарисовать композиционный reference и подключить его к `Composition`.
- Export node скачивает PNG/JPEG/WebP с выбранным quality/resize.
- Masked edit provider выбран на основании тестов, а не предположений.

## 11. Sources

OpenRouter Image Generation: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
OpenRouter Server Tool: https://openrouter.ai/docs/guides/features/server-tools/image-generation
OpenAI Images: https://developers.openai.com/api/docs/guides/image-generation
OpenAI Image Edits: https://platform.openai.com/docs/api-reference/images/createEdit
Drawing refs: https://konvajs.org/docs/react/Free_Drawing.html, https://github.com/steveruizok/perfect-freehand
Cutout refs: https://fal.ai/docs/model-api-reference/image-generation-api/birefnet, https://replicate.com/recraft-ai/recraft-remove-background, https://replicate.com/bria/remove-background
