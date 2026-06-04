# Reverie Image Production Pipeline: phase 4 plan

Дата: 2026-06-03

## 1. Контекст и продуктовый фокус

Этап 4 строим вокруг production-задачи более высокого уровня: не просто сгенерировать изображение, видео или текст, а собрать готовую единицу публикации под конкретную площадку, рубрику и бренд.

Главная demo-цель этапа:

> Пользователь собирает на canvas готовую публикацию для Telegram, Zen, VC, VK, Instagram, TikTok, LinkedIn или другой площадки из текста, изображений и будущих video assets, а нода публикации проверяет формат, ограничения и методические требования этой площадки.

Простыми словами: Reverie должен стать не только image/video production canvas, но и content production canvas. На выходе пользователь получает не разрозненные ассеты, а материал, который можно сразу отдать редактору, дизайнеру, SMM-менеджеру или перенести в площадку публикации.

## 2. Publication layer

На canvas появляется отдельный слой нод публикаций:

- publication nodes живут рядом с image / text / video nodes, но отвечают не за генерацию ассета, а за сборку готового материала;
- каждая publication node представляет конкретную content unit: например `Telegram Article`, `Zen Article`, `VC Post`, `VK Post`, `Instagram Carousel`, `TikTok Video Post`, `LinkedIn Article`;
- нода принимает на вход текст, изображения, видео и другие ассеты из downstream production-пайплайна;
- нода знает технические ограничения и методические правила выбранной площадки;
- нода показывает пользователю, готов ли материал к публикации и что нужно исправить.

Это отдельный продуктовый слой, потому что одна и та же картинка или текст могут быть использованы в разных публикационных форматах.

Пример:

- один image pipeline генерирует обложку;
- text nodes собирают статью;
- video pipeline собирает короткий ролик;
- `Telegram Article` собирает текст + обложку;
- `Instagram Carousel` собирает изображения + подпись;
- `LinkedIn Post` собирает более деловую версию текста и одно hero image.

## 3. Publication nodes

Publication node должна уметь работать в двух режимах:

### Assembly mode

Нода собирает материал из уже готовых входов:

- текст из `Text Generation`, `Concatenate`, `Text Prompt` или других текстовых нод;
- изображения из image pipeline;
- видео из future video pipeline;
- metadata: title, subtitle, tags, рубрика, бренд, author note.

В этом режиме нода ничего не генерирует сама, а валидирует и оформляет входящие данные.

### Generation assist mode

Нода помогает сгенерировать недостающие части:

- переписать текст под правила площадки;
- сократить текст до лимита;
- сделать заголовок;
- предложить caption;
- подготовить alt text;
- разложить длинный текст на carousel slides, thread или серию short posts;
- адаптировать tone of voice под бренд / рубрику.

Важно: генерация внутри publication node не заменяет text workflow nodes, а работает как финальный editorial assist.

## 4. Constraints and validation

Каждая publication node должна знать ограничения своего формата:

- максимальная и рекомендуемая длина текста;
- обязательность заголовка, лида, обложки, описания;
- допустимое количество изображений;
- требования к aspect ratio, размеру и формату изображений;
- допустимое форматирование: markdown, plain text, rich text, emoji, links, hashtags;
- ограничения по видео: длительность, aspect ratio, thumbnail, subtitles;
- требования к preview: cover, lead image, first frame, safe zones;
- platform-specific поля: tags, community, rubric, CTA, source links.

В UI нода должна показывать:

- `ready / warning / error` status;
- что именно не проходит;
- насколько превышен лимит;
- какие ассеты отсутствуют;
- какие поля желательно заполнить.

## 5. Brand and rubric presets

Publication node должна учитывать не только площадку, но и контекст бренда:

- brand tone of voice;
- рубрика / тип контента;
- методические требования;
- forbidden words / sensitive topics;
- формат заголовков;
- стиль CTA;
- правила работы с изображениями;
- требования к подписи, источникам, disclaimer.

Это позволит собирать готовые production-пайплайны для конкретных контентных единиц:

- `Gigonom / TechWave / Telegram article`;
- `Product launch / LinkedIn post`;
- `Short vertical video / TikTok`;
- `Research summary / VC article`;
- `Editorial carousel / Instagram`.

## 6. Platform coverage

Стартовый набор площадок для проектирования:

- Telegram;
- Zen;
- VC;
- VK;
- Instagram;
- TikTok;
- LinkedIn.

Для каждой площадки нужно описать не одну абстрактную ноду, а набор content units.

Примеры:

- Telegram: short post, long post, article, image post, video post, channel digest;
- Zen: article, narrative post, image-led article;
- VC: article, case study, announcement;
- VK: post, article, clip post;
- Instagram: single image post, carousel, story pack, reel cover + caption;
- TikTok: video post, series item, thumbnail + caption;
- LinkedIn: text post, article, image post, carousel-style document post.

## 7. Canvas workflow

Publication nodes должны поддерживать связи с обычными production nodes:

- text input ports;
- image input ports;
- video input ports;
- optional metadata ports;
- output port для финального publication artifact.

Нода может иметь несколько входов одного типа:

- несколько изображений для carousel;
- несколько текстовых блоков для long article;
- video + cover + caption;
- title + body + CTA.

Важный UX-принцип:

> Пользователь должен видеть, что публикация собирается как финальная упаковка production-пайплайна, а не как еще одна генерация картинки.

## 8. Output artifacts

На первом этапе publication nodes не обязаны напрямую публиковать в платформы.

MVP-output:

- preview публикации внутри ноды;
- copy-ready text;
- список attached assets;
- export package: text + images / video + metadata;
- validation report;
- platform-specific checklist.

Future output:

- direct publishing через backend / integrations;
- draft creation in platform;
- scheduled publishing;
- approval workflow;
- team comments;
- analytics feedback loop.

## 9. Приоритеты этапа 4

Порядок развития:

1. Спроектировать `PublicationArtifact` и схему platform constraints.
2. Добавить publication layer и базовый тип publication node.
3. Реализовать `Telegram Article` как первый end-to-end пример.
4. Реализовать generic validation UI: status, limits, missing fields, warnings.
5. Добавить brand / rubric preset model.
6. Добавить `Zen Article` и `VC Article`.
7. Добавить image-heavy formats: Instagram Carousel, VK Post.
8. Подключить future video assets: TikTok Video Post, Instagram Reel, VK Clip.
9. Реализовать export package для готовой публикации.
10. Подготовить архитектуру для backend publishing integrations, но не тащить direct publish в первый MVP этапа 4.

## 10. Риски

- У разных площадок ограничения меняются, поэтому platform constraints должны быть конфигурируемыми, а не захардкоженными в UI.
- Если нода будет пытаться и генерировать, и валидировать, и публиковать сразу, она станет слишком сложной. Нужны режимы и ясная ответственность.
- У платформ разные понятия "статьи", "поста", "карусели" и "видео", поэтому нельзя проектировать один универсальный формат для всех.
- Direct publishing потребует backend, auth и integration layer; это не нужно делать раньше стабильного publication artifact.
- Если не учитывать бренд и рубрику, нода будет технически валидной, но бесполезной для реального production.
- Для длинных текстов нужен удобный preview и split/section navigation, иначе publication node станет слишком тяжелой.

## 11. Итог этапа 4

Этап 4 считается успешным, если:

- на canvas есть отдельный слой publication nodes;
- пользователь может собрать готовую публикацию из text / image / video inputs;
- первая publication node проходит полный сценарий от входных данных до preview и export package;
- нода показывает техническую готовность материала к публикации;
- platform constraints и brand / rubric presets описаны как переиспользуемые конфигурации;
- добавлены первые форматы для Telegram, Zen и VC;
- архитектура готова к будущим video formats и backend publishing integrations.

Главный продуктовый результат:

> Reverie превращается из инструмента генерации ассетов в production-систему для сборки готовых контентных единиц под конкретные площадки, бренды и рубрики.
