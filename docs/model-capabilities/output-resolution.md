# Aspect Ratio и ожидаемый размер результата

Проверено 15.09.2026. Компонент применяется только в Generate Image и Generate Video. Crop, Composition, Refine и редакторы не изменены.

## Поведение

- Общая шкала содержит 21 позицию от 1:8 до 8:1, численно отсортированную по ширине/высоте. Новые форматы из каталога вставляются в соответствующее место. Недоступные для модели подписи скрываются; шкала не сжимается, ползунок пропускает эти позиции.
- Чёрный отрезок идёт от позиции 1:1 к выбранному формату. Даже когда квадрат недоступен модели, он остаётся геометрической точкой отсчёта.
- Клик по подписи или шкале выбирает ближайший доступный формат и закрывает меню. Drag от 4 px показывает локальный preview; отпускание сохраняет одну настройку и оставляет меню открытым. Вне меню / Escape закрывают его. Pointer cancellation отменяет только незавершённый preview. Изменение пропорций не запускает генерацию.
- Стрелки перемещаются между доступными форматами, Home/End выбирают крайние; Enter/Space подтверждают и закрывают. Auto — отдельная кнопка, только при поддержке моделью, без выдуманной позиции на числовой шкале.
- Preview сохраняет высоту 35 px и меняет ширину за 200 ms. При reduced motion переход отключён.
- Левый край меню привязан к полю, с ограничением по границе экрана. Для 21 подписи ширина выросла относительно 10-позиционного макета: 32 px на шаг, около 697 px всего. На узком экране прокручивается шкала, координаты её точек сохраняются; заголовок переносит preview на отдельную строку.

## Данные и границы точности

Референс: [Figma 666:2508](https://www.figma.com/design/UA1XIcYdD0DUr5gPCSGUQm/REVERIE-img-prodaction-pipeline?node-id=666-2508). Числа на макете демонстрационные: 1200 × 1600 соответствует 3:4, а не 4:5.

Доступность форматов/уровней по-прежнему определяет существующий live catalog. Справочник размеров находится в `src/shared/media/output-resolution`; он не меняет запросы к провайдерам и не расширяет capabilities. Открытие меню не делает запросов. Видео использует `supportedSizes`, полученные вместе с имеющимся каталогом (серверный кэш 5 минут). Изображения используют небольшие локальные таблицы с явными ID моделей, а не правилом для всех будущих моделей семейства.

`openrouter-media-snapshot.json` фиксирует все 52 записи Images API и все 29 записей Videos API на дату проверки. Дополнительно прочитаны endpoint records всех 52 image-моделей: они дают параметры/провайдеров, но не таблицу `resolution × aspect_ratio → pixels`. SVG-only, editing/upscale/avatar и другие несовместимые записи остаются вне текущих генераторов по существующим правилам.

Надпись в пикселях — ожидаемый размер из опубликованной таблицы, не обещание результата. Фактические dimensions принадлежат созданному asset. При отсутствии однозначных данных показываем «Размер по модели» (с выбранным K/p-уровнем, если он есть); tooltip объясняет, что точные размеры появятся после генерации. При Auto не подставляем квадрат.

## Проверенные источники и покрытие

| Модели | Что установлено | Отображение |
|---|---|---|
| Gemini 2.5 Flash Image | [Google: таблица нативных размеров](https://ai.google.dev/gemini-api/docs/generate-content/image-generation#aspect_ratios_and_image_size), 10 форматов | Пиксели для 1K/auto. Исторический 2K в Chat Completions не имеет подтверждённой таблицы — размер по модели. |
| Gemini 3.1 Flash Image, preview; Gemini 3 Pro Image, preview; Gemini 3.1 Flash Lite Image | Тот же [источник Google](https://ai.google.dev/gemini-api/docs/generate-content/image-generation#aspect_ratios_and_image_size); отдельные таблицы уровней и форматов | Flash 512/1K/2K/4K; Pro 1K/2K/4K; Lite 1K в рамках каталога. 0.5K — имя 512 в старом UI. |
| Recraft V3; V4, V4.1, Utility, Styles и их Pro | [Recraft Appendix](https://www.recraft.ai/docs/api-reference/appendix) публикует конкретные таблицы, включая отличия Pro | Нативные размеры соответствующей версии; Pro вдвое по каждой стороне согласно таблице. SVG-only варианты не подключаются. |
| GPT Image 1/1 Mini/2/2.5 Flare/Sunburst и legacy GPT-5 image wrappers | [OpenRouter Images API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) и endpoint records: независимые aspect ratio и quality; у новых image ID нет resolution enum | Не выдаём quality за размер и не приравниваем legacy K к универсальным пикселям. Размер по модели. |
| Seedream 4.5, 5.0 Lite/Pro | [BytePlus image generation tutorial](https://docs.byteplus.com/api/docs/ModelArk/1824121) описывает уровни/примерные рекомендованные размеры; OpenRouter имеет свой перевод tier + ratio | Однозначная таблица преобразования OpenRouter для всех форматов не опубликована. Размер по модели. |
| Qwen Image 3/3 Pro | [Alibaba Qwen image API](https://www.alibabacloud.com/help/en/model-studio/qwen-image-api) и OR endpoint records | Уровни известны; соответствие нормализованных параметров OpenRouter конкретным пикселям не подтверждено. Размер по модели. |
| FLUX.2 Max/Flex/Pro/Klein | [BFL output dimensions](https://help.bfl.ai/articles/8916739058-what-aspect-ratios-and-output-dimensions-are-supported) допускает округление и разные способы задания размера | Пиксельный бюджет/максимум не является таблицей результата маршрута OpenRouter. Размер по модели. |
| Krea 2 Large/Medium/Turbo | [Krea API](https://www.krea.ai/blog/krea-2-api-launch) публикует форматы; endpoint records — 1K | Не выводим 1024 по обеим сторонам для любого формата. Размер по модели. |
| Grok Imagine Image 2.0/Quality | [xAI](https://docs.x.ai/developers/model-capabilities/images/generation) публикует aspect ratio и 1k/2k отдельно | Точные пары пикселей для всех форматов не опубликованы. Размер по модели. |
| MAI Image 2.5/Pro, 2.6/Flash; Muse Image | [Microsoft](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image), model records | Лимит пикселей не равен обещанию размеров; у Muse нет выбираемого формата в OR. Размер по модели. |
| Riverflow V2/V2.5 Fast/Pro | [Sourceful/Riverflow](https://help.riverflow.ai/en/articles/16157990-create-images-from-prompts), endpoint records | Уровни и ratios подтверждены, точная таблица вывода через OR — нет. Размер по модели. |
| Veo 3.1/Fast/Lite; Kling V3 Pro/Std/O1; Hailuo 2.3; Runway Gen-4.5; Sora 2 Pro; Wan 2.6/2.7; Grok Imagine Video; Seedance 1.5/2.0/Fast/Mini | [OR Videos API](https://openrouter.ai/api/v1/videos/models) возвращает supported_sizes | Выбирается только однозначная опубликованная пара с нужной короткой стороной и пропорцией (допуск на codec rounding). Для отсутствующей комбинации — размер по модели. |
| Seedance 2.5 | В том же каталоге 480p/720p — разные пиксельные бюджеты, например square 640/960 | Явная таблица: 720p 1:1 = 960×960, 4:3 = 1112×834; значение дополнительно должно присутствовать в live supported_sizes. |
| Hailuo 3/3 Max, Wan 3.0/Prime, Grok Imagine Video 1.5 | OR публикует ratios/tiers, supported_sizes отсутствует | Размер по модели. Не переносим значения предыдущей версии. |
| Остальные video edit/upscale/avatar/неподключённые семейства | Проверены в снимке 29 записей | Не расширяют scope Generate Video. |

Обнаружена ошибка в Google-таблице: Flash 512 / 21:9 указан как 792×168 (отношение около 4.71). Такой размер не выводится. Не заменяем его самостоятельно предполагаемым 792×336.

## Обновление и проверка

При добавлении модели сначала обновлять live capability contract; размер добавлять только при наличии первичного источника, учитывая конкретный route. Не переносить данные по совпадению названия или K-уровня. Обновить снимок, дату, таблицу и тесты. Для новых/неизвестных комбинаций безопасное поведение уже определено.

Проверки: математическая шкала и пропуски; различия размеров моделей/tiers; отсутствующие и противоречивые данные; browser click/drag/cancel/keyboard, сохранение и отсутствие генераций; node help/catalog, typecheck, lint и архитектура.
