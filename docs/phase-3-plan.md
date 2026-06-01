# Reverie Image Production Pipeline: phase 3 plan

Дата: 2026-06-01

## 1. Контекст и продуктовый фокус

Этап 3 строим вокруг самой болезненной production-задачи: сохранить одного и того же героя или объект в серии кадров.

Главная demo-цель этапа:

> Пользователь создает одного героя или продуктовый объект, сохраняет его паспорт и генерирует серию из 5 разных кадров, где субъект остается узнаваемым.

Важно: под "героем" понимаем не только живого персонажа. Это может быть человек, модель, маскот, предмет, продукт, упаковка, автомобиль, аксессуар, одежда, мебель, устройство или любой другой визуальный центр съемки.

Поэтому в модели и UI не используем слишком узкое слово `Character` как базовую сущность. Базовая сущность этапа 3:

- `Subject` - универсальный герой / объект / продукт;
- `Subject Passport` - паспорт субъекта;
- `Subject Library` - библиотека переиспользуемых субъектов.

Простыми словами: продукт должен научиться не просто генерировать красивую картинку, а "помнить", кого или что мы снимаем, и переносить эту идентичность из кадра в кадр.

## 2. Приоритеты этапа 3

Порядок развития:

1. Project & Pipeline Portability: сохранение, экспорт и импорт проектов и пайплайнов.
2. Batch Export / Multi-Asset Export: экспорт пачки изображений с едиными настройками.
3. Asset Refine / Quality Enhance: улучшение качества вырезанных фрагментов перед переиспользованием.
4. Text Workflow Nodes: сборка, генерация и разбиение текстовых промптов / сюжетов.
5. Subject System: универсальный паспорт героя / объекта / продукта.
6. 5-shot consistency workflow: один субъект в пяти разных кадрах.
7. Camera System: управление крупностью, ракурсом и движением камеры.
8. Location System: сохранение и переиспользование локаций.
9. Scene Builder: сборка сцен из субъектов, камеры, локаций и генераций.
10. Video generation: first frame / last frame, короткие клипы и история video outputs.
11. 3D / Rodin research: проверка, помогает ли 3D реально улучшить ракурсы и консистентность.

Почему так:

- Без сохранения и импорта нельзя нормально тестировать длинные production-пайплайны.
- Batch export нужен для production-серий: когда пользователь получил несколько кадров, refined-фрагментов или референсов, он должен выгрузить их одним действием, а не скачивать по одному файлу.
- Refine нужен до полноценного Subject System, потому что пользователь часто вырезает из большой картинки лицо, предмет, логотип или деталь и хочет превратить этот фрагмент в качественный reference asset.
- Text Workflow Nodes нужны как сценарный слой: они позволяют собрать несколько текстовых входов, сгенерировать из них серию промптов и разложить результат на отдельные кадры / сцены.
- Без Subject System видео останется просто набором случайных красивых генераций.
- Камера важнее локации для первого demo-сценария, потому что пользователь должен быстро получать разные планы одного и того же субъекта.
- Локации, сцены, видео и 3D имеют смысл после того, как доказана управляемая консистентность субъекта.

## 3. Project & Pipeline Portability

### Задача

Проект должен открываться в том же состоянии, в котором пользователь его оставил. Это часть ощущения production-инструмента, а не демо-приложения.

Нужно сохранять:

- nodes;
- edges;
- sections;
- image / video / audio assets;
- generation history;
- active selected generation version;
- status карточек: `idle`, `running`, `success`, `error`;
- error / success messages;
- позиции и размеры карточек;
- состояние карточек: collapsed / expanded;
- состояние секций, если секции можно сворачивать;
- viewport canvas: pan / zoom;
- settings моделей;
- timestamps;
- project schema version.

Отдельный важный UX-критерий: если пользователь свернул карточки, после перезагрузки, экспорта или импорта они должны остаться свернутыми.

### Два вида переносимости

#### Full project export / import

Полный проект включает:

- `project.json` с графом, секциями, состояниями UI и metadata;
- папку / bundle с ассетами;
- историю генераций;
- активные версии результатов;
- настройки моделей и провайдеров.

Это нужно для продолжения работы и передачи проекта между устройствами / участниками команды.

#### Pipeline template export / import

Шаблон пайплайна включает:

- схему узлов;
- секции;
- связи;
- настройки;
- роли входов и выходов;
- collapsed / expanded состояние;
- placeholder-слоты для ассетов.

Шаблон не обязан включать тяжелые generated assets. Его цель - переиспользовать сам способ производства результата.

Пример: пользователь один раз собрал пайплайн "subject passport -> 5 shot variants -> export" и потом применяет его к новому продукту.

### Техническое направление

Нужна версионированная схема проекта:

```ts
type ProjectExport = {
  schemaVersion: number;
  exportedAt: string;
  project: GraphProject;
  uiState: ProjectUiState;
  assetsManifest: AssetManifestItem[];
};
```

UI-состояние лучше хранить явно, а не угадывать его из данных узла:

```ts
type ProjectUiState = {
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  nodes: Record<string, {
    collapsed?: boolean;
    selectedTab?: string;
  }>;
  sections: Record<string, {
    collapsed?: boolean;
  }>;
};
```

Простыми словами: есть production-данные, а есть состояние рабочего стола. Оба важны, но их лучше не смешивать в одну кашу.

## 4. Asset Refine / Quality Enhance

### Задача

Пользователь должен уметь взять слабый или маленький фрагмент изображения и превратить его в более качественный reference asset.

Ключевой use case:

1. Пользователь загружает исходное изображение.
2. `Crop` node вырезает важный фрагмент: лицо, продукт, логотип, аксессуар, текстуру, форму, деталь упаковки.
3. `Refine / Enhance` node улучшает качество фрагмента: резкость, детализацию, чистоту, разрешение.
4. Результат сохраняется как новый image asset.
5. Этот asset дальше используется как reference в `Subject Passport`, `Generate Image`, `Export` или других нодах.

Простыми словами: crop дает "сырой кусок", а refine превращает его в пригодный production-референс.

### Важная оговорка

Через OpenRouter это не настоящий пиксельный upscale в строгом смысле. Это генеративное улучшение: модель может дорисовывать детали, чистить шум, делать high-res redraw и повышать субъективное качество.

Поэтому функцию в UI лучше не называть только `Upscale`. Более честные названия:

- `Refine`;
- `Enhance`;
- `Detail Boost`;
- `High-res Redraw`;
- `Reference Cleanup`.

Если позже понадобится строгий x2 / x4 upscale без смысловой перерисовки, это лучше вынести в отдельный provider spike с Real-ESRGAN / Clarity / Magnific-like / Replicate / fal.ai providers.

### `Refine / Enhance` node

Входы:

- image;
- optional text instruction;
- optional subject / product constraints позже.

Настройки:

- mode: cleanup, sharpen, detail boost, high-res redraw, reference cleanup;
- preserve strength: насколько строго держаться исходного crop;
- target size: 1K / 2K / 4K, если provider поддерживает;
- aspect behavior: preserve source aspect ratio;
- negative constraints: не менять форму, логотип, пропорции, лицо, цветовую схему;
- provider / model.

Выходы:

- refined image;
- generation history;
- input snapshot;
- provider metadata;
- warning, если это generative redraw, а не точный upscale.

### Provider direction

Первый technical path:

- использовать OpenRouter image-to-image модели через текущий image generation / edit flow;
- передавать crop как image reference;
- просить сохранить форму, идентичность и композицию;
- запрашивать более высокий `image_size`, если модель поддерживает 2K / 4K.

Кандидаты для проверки:

- OpenAI GPT Image models;
- Google Nano Banana / Nano Banana Pro;
- Recraft image-to-image models;
- FLUX.2 Pro / Flex / Max;
- Seedream 4.5;
- Sourceful Riverflow V2, включая super-resolution reference сценарии.

Второй technical path:

- добавить специализированный upscale provider вне OpenRouter, если нужно строгое увеличение без изменения идентичности.

### Acceptance criteria

- Пользователь может подключить output `Crop` node к `Refine / Enhance` node.
- Refine сохраняет результат как новый image asset.
- Refined asset можно подключить как reference к другим нодам.
- Refine хранит историю вариантов.
- Пользователь видит предупреждение, что OpenRouter-based refine является генеративным улучшением.
- Для subject/product refs есть preset "preserve identity / preserve shape".

## 5. Batch Export / Multi-Asset Export

### Задача

`Export` node должен уметь экспортировать не только одно изображение, но и пачку изображений с одинаковыми настройками.

Ключевой use case:

1. Пользователь получает несколько image assets: imports, crops, refined refs, generation results или пять кадров subject-серии.
2. Все нужные assets подключаются к одному `Export` node.
3. Пользователь один раз выбирает format, quality, scale и background.
4. `Export` применяет эти настройки ко всем входным изображениям.
5. Если изображение одно, скачивается один файл.
6. Если изображений несколько, скачивается один `.zip` с подготовленными файлами.

Простыми словами: одна export-нода должна быть финальной точкой выгрузки серии, а не только одиночной картинки.

### UX

Preview в `Export` node становится множественным, если подключено больше одного изображения:

- карточка показывает активное изображение из входной пачки;
- появляются стрелки назад / вперед;
- показывается счетчик, например `3/7`;
- fullscreen preview тоже должен уметь листать изображения;
- `Download` скачивает все изображения с едиными настройками;
- для одиночного входа поведение остается прежним.

Визуально это должно работать так же, как уже реализованное листание image history: пользователь видит одну активную превьюшку, но понимает, что внутри export-набора несколько файлов.

### Настройки

В первой версии настройки единые для всех входных изображений:

- format: png / jpeg / webp;
- quality для jpeg / webp;
- scale / resize;
- background для случаев, когда формат не поддерживает alpha;
- preserve alpha для png / webp;
- filename pattern;
- zip filename.

Не нужно сразу делать индивидуальные настройки на каждый файл. Это усложнит UX и сломает главный сценарий: быстро выгрузить пачку с одинаковым production-пресетом.

### Техническое направление

Нужна модель input collection:

```ts
type ExportImageItem = {
  assetId: string;
  sourceNodeId: string;
  sourceLabel?: string;
  filename?: string;
};
```

`Export` node должен уметь собрать список входных image assets из нескольких подключений. Порядок можно сначала определять порядком подключения или позицией source-ноды сверху вниз; позже можно добавить ручную сортировку.

Для zip-упаковки:

- конвертировать каждый asset в выбранный формат;
- валидировать ошибки по каждому файлу отдельно;
- добавлять `manifest.json` опционально позже;
- упаковывать все результаты в один zip;
- скачивать один архив вместо серии отдельных browser downloads.

### Acceptance criteria

- К одному `Export` node можно подключить несколько image outputs.
- Единые export settings применяются ко всем входным изображениям.
- Preview показывает активный элемент пачки.
- В preview есть стрелки и счетчик.
- Fullscreen preview умеет листать export items.
- Если вход один, скачивается один файл.
- Если входов несколько, скачивается zip.
- Zip содержит все изображения с предсказуемыми именами файлов.

## 6. Text Workflow Nodes

### Задача

Добавить три простые текстовые ноды по логике Figma Weave:

- `Text Concatenator`;
- `Text Generation`;
- `Text Splitter`.

Их роль - не заменить текущие production layers, а дать пользователю низкоуровневые инструменты для сборки промптов, сценариев и серий.

Простыми словами: сейчас у нас есть специальные production-ноды, а здесь нужны универсальные текстовые "кирпичики". Пользователь сам решает, что собрать, что сгенерировать и как потом разложить результат.

### `Text Concatenator`

Назначение: собрать несколько текстовых входов в один текстовый output.

Источники:

- ручной `Text Prompt`;
- результат `ImageToText` / Extract;
- output `Reference Composer`;
- результат `Text Generation`;
- отдельные элементы из `Text Splitter`;
- любые будущие text outputs.

Настройки:

- порядок входов;
- separator: newline, double newline, custom text, markdown heading;
- optional labels для каждого блока;
- template prefix / suffix;
- режим preserve source headings;
- возможность добавить еще один text input.

Use cases:

- собрать style guide, subject notes, camera notes и negative constraints в один generation prompt;
- объединить описания из нескольких изображений;
- собрать задачу для `Text Generation`: "используй вот эти референсы и сделай 6 промптов";
- подготовить единый сценарный brief для splitting.

Выход:

- один text output;
- source map optional позже, чтобы понимать, из каких входов собран текст.

### `Text Generation`

Назначение: универсальная LLM-нода для генерации текста без жестких пресетов.

Это упрощенный аналог Extract / ImageToText, но без заранее заданных production layers. Пользователь сам пишет инструкцию: что сгенерировать, переписать, суммаризировать, расширить или структурировать.

Входы:

- text;
- preset / composed text;
- optional image references, если модель поддерживает image input;
- optional additional image inputs.

Настройки:

- model;
- instruction / prompt;
- output style: plain text, markdown, numbered list, JSON later;
- temperature / creativity later;
- run history.

Use cases:

- сгенерировать 5-10 вариантов промптов для серии иллюстраций;
- превратить brief в shot list;
- переписать extracted description в production-ready prompt;
- сделать короткое описание subject или location;
- из общего сюжета сделать список сцен;
- нормализовать текст перед `Text Splitter`.

Выход:

- text output;
- generation history;
- active text version.

### `Text Splitter`

Назначение: разделить один длинный текст на набор отдельных элементов.

Это критично для серий иллюстраций и сцен: пользователь может сгенерировать один список промптов или один сюжет, а потом разложить его на отдельные кадры / сцены / text outputs.

Режимы split:

- delimiter: custom separator;
- newline / paragraph;
- numbered list;
- markdown headings;
- JSON array later;
- scene markers, например `Scene 1`, `Scene 2`;
- LLM-assisted split later, если текст плохо структурирован.

UX:

- карточка показывает список items;
- сверху счетчик, например `6 items`;
- каждый item можно просмотреть;
- можно удалить или отредактировать item вручную позже;
- каждый item может стать отдельным text output;
- можно быстро создать набор downstream nodes из items.

Use cases:

- сгенерировать 6 промптов и разложить их на 6 generation nodes;
- разделить сюжет на сцены;
- разделить shot list на отдельные кадры;
- сделать серию иллюстраций из одного brief;
- подготовить будущий Scene Builder.

### Техническое направление

Для `Text Splitter` важно заранее решить, как граф работает с множественным text output.

MVP-варианты:

1. `Text Splitter` хранит `items[]`, а пользователь выбирает активный item как output.
2. Нода создает несколько динамических output ports: `item 1`, `item 2`, `item 3`.
3. Нода умеет командой `Create nodes from items` создать несколько `Text Prompt` или `Generate Image` nodes.

Самый прагматичный старт: хранить `items[]`, показывать список, дать команду "create nodes from items". Динамические порты можно добавить позже, если станет понятно, что они нужны в ежедневной работе.

### Acceptance criteria

- `Text Concatenator` принимает несколько text inputs и выдает один text output.
- Пользователь может менять порядок и separator.
- `Text Generation` принимает text и optional image inputs, запускает LLM и сохраняет text result.
- `Text Generation` не требует выбора production preset.
- `Text Splitter` делит текст на items по выбранному правилу.
- Splitter показывает список items и счетчик.
- Из split items можно создать отдельные text/generation nodes или подключить их дальше в пайплайн.

## 7. Subject System

### Задача

Пользователь должен создать универсальный `Subject Passport`, который можно подключать к разным генерациям.

Субъект может быть:

- person;
- product;
- fashion item;
- vehicle;
- prop;
- mascot;
- creature;
- interior object;
- packaging;
- other.

### Что хранит Subject Passport

Минимальный состав:

- title / name;
- subject type;
- short identity summary;
- reference images;
- approved generations;
- immutable traits: признаки, которые нельзя терять;
- mutable attributes: то, что можно менять;
- negative constraints: что нельзя переносить или искажать;
- cutout / mask, если есть;
- prompt fragments;
- preferred model settings;
- notes;
- generation history links.

Примеры immutable traits:

- форма лица;
- прическа;
- силуэт продукта;
- форма упаковки;
- логотип;
- материал;
- цветовая схема;
- пропорции;
- уникальные детали.

Примеры mutable attributes:

- одежда;
- аксессуары;
- поза;
- выражение;
- цвет фона;
- lighting;
- camera angle;
- product placement;
- окружение.

### Атрибуты и "слои"

Одежду, аксессуары, цвет, материал и другие изменяемые признаки лучше считать не графическими слоями в Photoshop-смысле, а управляемыми атрибутами субъекта.

То есть `Outfit`, `Material`, `Colorway`, `Logo`, `Pose`, `Expression`, `Accessory` - это attribute handles. Они помогают промпту и reference routing понять, что можно заменить, а что должно остаться неизменным.

Пример:

> Сохрани тот же subject identity и форму лица, но замени outfit на черный кожаный плащ.

Для продуктового объекта:

> Сохрани форму флакона, крышку, логотип и пропорции, но измени material finish на matte black.

## 8. Subject nodes

### `Subject Passport` node

Назначение: создать и хранить паспорт субъекта.

Входы:

- image references;
- text notes;
- cutout / mask optional;
- approved generated image optional.

Выходы:

- subject reference;
- identity prompt;
- immutable constraints;
- mutable attributes;
- selected reference images.

### `Subject Apply` / `Subject Reference` node

Назначение: подключить subject passport к конкретной генерации и выбрать, какие части паспорта использовать.

Настройки:

- preserve identity strength;
- selected references;
- selected immutable traits;
- selected mutable attributes;
- attribute overrides;
- negative constraints.

### `Subject Consistency Check` node

Назначение: оценить, насколько результат похож на паспорт субъекта.

Первая версия может быть ручной:

- пользователь отмечает result как `approved`, `needs fix`, `rejected`;
- approved result можно добавить обратно в паспорт.

Позже можно добавить автоматическую оценку:

- vision-model critique;
- face / object similarity score;
- сравнение с approved refs;
- предупреждение: "потерян логотип", "изменилась форма", "лицо стало другим".

## 9. 5-shot consistency workflow

### Цель

Пользователь должен получить серию из пяти кадров с одним и тем же субъектом.

Базовый сценарий:

1. Импортировать 2-5 референсов субъекта.
2. Создать `Subject Passport`.
3. Выделить immutable traits и mutable attributes.
4. Собрать `5-shot template`.
5. Сгенерировать пять кадров с разной постановкой.
6. Отобрать approved results.
7. Добавить удачные результаты обратно в Subject Passport.
8. Экспортировать проект или сохранить pipeline template.

### Пример пяти кадров

Для человека / модели:

- close-up portrait;
- medium shot;
- full body shot;
- three-quarter angle;
- action / movement shot.

Для продукта:

- hero packshot;
- close-up detail;
- product in hand / usage shot;
- three-quarter angle;
- campaign lifestyle shot.

### Acceptance criteria

- Один subject passport можно подключить минимум к пяти generation nodes.
- Каждая generation node может иметь свой prompt, camera и composition.
- Все пять результатов сохраняются в history.
- Пользователь может пометить результаты как approved / rejected.
- Approved results можно добавить в паспорт субъекта.
- Проект можно экспортировать и импортировать без потери пяти кадров, истории и collapsed / expanded состояния.

## 10. Camera System

После Subject System следующий приоритет - управление камерой.

### Задача

Пользователь должен менять план и ракурс без потери subject identity.

Нужна отдельная сущность / нода:

- `Camera Control`;
- `Shot Preset`;
- `Camera Preset`.

Параметры:

- shot size: close-up, medium, full body, wide, detail;
- angle: frontal, side, three-quarter, low angle, high angle, top-down;
- camera height;
- distance;
- lens feel: wide, normal, telephoto;
- perspective strength;
- depth of field;
- motion intent for future video: push in, pull out, orbit, pan, tilt.

Простыми словами: камера должна стать не просто текстом в промпте, а переиспользуемым контролом, который можно применять к серии кадров.

## 11. Location System

Локации идут после subject и camera.

### Задача

Сохранить окружение между сценами и кадрами.

Будущая сущность:

- `Location Passport`;
- `Environment Reference`;
- `Clean Plate`;
- `Lighting Anchor`;
- `Background Consistency Check`.

Минимальный состав:

- reference images;
- background description;
- key objects;
- lighting;
- color grade;
- allowed camera angles;
- clean plate optional;
- generated / approved frames.

Локация должна подключаться к генерации отдельно от subject, чтобы пользователь мог сохранить героя и менять пространство или сохранить пространство и менять героя.

## 12. Scene Builder and video

Scene Builder не является первым блоком этапа 3, но должен учитываться в архитектуре.

Будущая production-иерархия:

```txt
Project
  Subject Library
  Location Library
  Scene
    Shot
      Frame
      Generation Result
      Video Clip
```

Scene Builder должен связывать:

- subject;
- location;
- camera preset;
- action;
- dialogue / voice optional;
- text splitter scene items;
- generated image frames;
- generated video clips.

Video generation добавляем после того, как есть стабильные first frames:

- first frame;
- last frame optional;
- duration;
- camera motion;
- provider;
- generation status;
- video history;
- export.

## 13. 3D / Rodin research

3D не является ядром третьего этапа. Это отдельный research track после subject, camera и первых сцен.

Проверяемые гипотезы:

- можно ли из subject references получить полезную 3D-болванку;
- помогает ли 3D выбирать новые ракурсы продукта;
- можно ли использовать 3D preview как источник composition / camera reference;
- оправдана ли стоимость и сложность 3D в реальном production workflow.

Возможные применения:

- product turntable;
- rough avatar / mascot;
- prop generation;
- camera previz;
- reference renders для нескольких ракурсов.

Риск: 3D может выглядеть эффектно, но не решить главную боль консистентности. Поэтому сначала доказываем Subject System, потом проверяем 3D.

## 14. Предлагаемый порядок реализации

### Iteration 3.0: Project and pipeline portability

- Ввести project export / import.
- Ввести pipeline template export / import.
- Сохранять collapsed / expanded состояние карточек.
- Сохранять viewport pan / zoom.
- Сохранять active generation versions.
- Добавить project schema version и миграции.

Критерий готовности: проект после импорта выглядит и работает так же, как перед экспортом.

### Iteration 3.1: Batch Export / Multi-Asset Export

- Расширить `Export` node до нескольких image inputs.
- Собирать input asset list из подключенных image outputs.
- Применять единые format / quality / scale / background settings ко всей пачке.
- Добавить arrows + counter в preview.
- Поддержать листание export items в fullscreen preview.
- Добавить zip download для нескольких файлов.
- Добавить предсказуемый filename pattern.
- Проверить mixed inputs: import, crop, refined image, generated image.

Критерий готовности: пользователь может подключить несколько изображений к одной `Export` node и скачать один zip с одинаково обработанными файлами.

### Iteration 3.2: Asset Refine / Quality Enhance

- Добавить `Refine / Enhance` node.
- Подключить вход image от `Crop`, `Import Image`, `Generate Image` и других image outputs.
- Поддержать режимы cleanup, sharpen, detail boost, high-res redraw.
- Сохранять refined output как новый image asset.
- Сохранять историю refine-вариантов.
- Проверить OpenRouter image-to-image модели на crop -> refine -> reference workflow.
- Зафиксировать, какие providers дают меньше всего искажений формы, лица, логотипа и продукта.

Критерий готовности: пользователь может вырезать фрагмент через `Crop`, улучшить его качество через `Refine / Enhance` и использовать результат как reference в следующих нодах.

### Iteration 3.3: Text Workflow Nodes

- Добавить `Text Concatenator` node.
- Добавить `Text Generation` node.
- Добавить `Text Splitter` node.
- Поддержать text inputs от `Text Prompt`, `ImageToText`, `Reference Composer` и других text outputs.
- Для `Text Concatenator` поддержать порядок входов, separator и prefix / suffix.
- Для `Text Generation` поддержать prompt, model, run history и text output.
- Для `Text Splitter` поддержать split by delimiter / newline / numbered list.
- Добавить счетчик items и preview списка.
- Проверить flow: extracted text + manual text -> concatenator -> text generation -> splitter -> несколько generation prompts.

Критерий готовности: пользователь может собрать несколько текстовых источников, сгенерировать список промптов или сцен и разложить его на отдельные элементы пайплайна.

### Iteration 3.4: Subject Passport foundation

- Добавить модель `Subject`.
- Добавить `Subject Passport` node.
- Поддержать subject type.
- Поддержать reference images и approved generations.
- Поддержать immutable traits, mutable attributes и negative constraints.

Критерий готовности: пользователь может создать паспорт человека или продукта и переиспользовать его в генерации.

### Iteration 3.5: Subject routing into generation

- Подключить subject passport к `Generate Image`.
- Настроить prompt assembly для subject identity.
- Разделить preserve identity и attribute overrides.
- Не смешивать subject reference с background / style / camera references.

Критерий готовности: один subject passport может управлять несколькими generation nodes.

### Iteration 3.6: 5-shot consistency template

- Добавить шаблон серии из пяти кадров.
- Поддержать shot presets для person и product scenarios.
- Поддержать генерацию shot prompts через Text Workflow Nodes.
- Добавить batch-like запуск или удобный последовательный запуск пяти генераций.
- Добавить approved / rejected status для результатов.

Критерий готовности: пользователь получает пять разных кадров одного субъекта и может отобрать удачные.

### Iteration 3.7: Subject consistency review

- Добавить ручной consistency review.
- Добавить возможность отправить approved result обратно в Subject Passport.
- Исследовать автоматическую проверку similarity / critique.

Критерий готовности: паспорт субъекта улучшается по мере работы, а не остается статичной карточкой.

### Iteration 3.8: Camera Control

- Добавить `Camera Control` / `Shot Preset` node.
- Поддержать крупность, ракурс, lens feel и camera motion intent.
- Подключить camera node к generation.
- Проверить, что изменение камеры не ломает subject identity.

Критерий готовности: пользователь может получить разные планы одного субъекта управляемо, а не через случайный prompt.

### Iteration 3.9: Location Passport

- Добавить `Location Passport`.
- Хранить environment references, lighting и clean plate optional.
- Подключить location к generation отдельно от subject.

Критерий готовности: субъект и локация становятся двумя независимыми production-сущностями.

### Iteration 3.10: Scene / video / 3D spikes

- Спроектировать Scene Builder.
- Проверить сценарий: long story -> Text Generation -> Text Splitter -> Scene / Shot nodes.
- Проверить first-frame / last-frame video provider flow.
- Проверить Rodin / 3D previz как camera-reference источник.

Критерий готовности: понятно, какой следующий крупный блок имеет лучший product / technical ROI.

## 15. Риски

- Генеративные модели не гарантируют идеальную идентичность субъекта.
- OpenRouter-based refine может менять детали crop-фрагмента, поэтому нельзя обещать точный upscale без provider-тестов.
- Улучшение качества маленького crop может дорисовывать несуществующие детали; для продукта, лица и логотипа нужен ручной review.
- Batch export через zip может упереться в память браузера на больших пачках и 4K-ассетах.
- Для multi-export нужны предсказуемые имена файлов, иначе пользователь быстро теряет связь между exported file и source node.
- Text Splitter может создавать слишком много элементов и перегружать граф, поэтому нужны лимиты и удобный preview перед созданием downstream nodes.
- Text Generation без пресетов дает гибкость, но требует хороших дефолтных инструкций и истории версий, иначе пользователь быстро потеряет удачный текст.
- Люди, продукты, одежда и упаковка требуют разных критериев консистентности.
- Слишком много reference images может конфликтовать и ухудшать результат.
- Если не разделить subject / camera / background / style, модель будет смешивать роли референсов.
- Export / import с ассетами может быстро стать тяжелым по размеру.
- Pipeline templates должны переживать изменение схемы проекта, поэтому нужна версия и миграции.
- Автоматический consistency score может быть неточным; сначала нужен ручной review.
- Video generation дорогая и медленная, поэтому ее нельзя ставить раньше стабильных image frames.

## 16. Итог этапа 3

Этап 3 считается успешным, если:

- пользователь может сохранить, экспортировать и импортировать полный проект;
- collapsed / expanded состояние карточек сохраняется;
- пользователь может экспортировать и импортировать reusable pipeline template;
- пользователь может вырезать фрагмент изображения, улучшить его качество и использовать результат как reference asset;
- пользователь может подключить пачку изображений к одной export-ноде, пролистать preview и скачать один zip с едиными настройками;
- пользователь может собрать несколько текстовых источников, сгенерировать серию промптов / сцен и разложить их на отдельные элементы;
- пользователь может создать универсальный Subject Passport для человека или продукта;
- один Subject Passport можно применить к серии из пяти кадров;
- пользователь может отобрать approved results и улучшить паспорт субъекта;
- камера становится управляемым production-контролом, а не случайным текстом в prompt.

Главный продуктовый результат:

> Reverie начинает решать не задачу одиночной генерации, а задачу повторяемого AI production: один субъект, несколько кадров, сохраненный пайплайн и управляемая консистентность.
