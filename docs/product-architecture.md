# Reverie Production Layer: product architecture

Дата: 2026-06-06

## 1. Зачем нужен этот документ

Этот документ фиксирует продуктовую архитектуру текущего production canvas в контексте будущей экосистемы Reverie / Gigonom.

Важно: текущий canvas не является всем продуктом. Это production layer для создания изображений, текстов, будущих видео и готовых публикаций. Он должен быть самостоятельным рабочим инструментом, но в будущем встроиться в более крупный workflow контент-маркетинга.

## 2. Большой контекст

Целевая система закрывает контент-маркетинг как бизнес-функцию по HADI-логике:

1. Strategy layer формирует гипотезы, цели, рубрики, темы и задачи.
2. Production layer производит ассеты, публикации и reusable pipelines.
3. Kanban / planning layer хранит черновики, задачи, approval flow и статусы.
4. Publishing layer отправляет готовые материалы в площадки или готовит их к ручной публикации.
5. Analytics layer сравнивает фактические данные с целями и гипотезами.
6. Insights layer подсказывает следующий production cycle.

Текущий репозиторий отвечает в первую очередь за пункт 2, но должен проектироваться так, чтобы его результаты можно было использовать в пунктах 3-6.

## 3. Термины

### Workspace

Workspace - рабочее пространство бренда или бизнеса.

Один workspace содержит документы, библиотеку объектов, библиотеку шаблонов, будущие executable pipelines, публикации, задачи Kanban и аналитику. Это уровень "для какого бренда мы работаем".

### Document / File

Document или file - конкретный рабочий файл, который пользователь открывает в canvas editor.

В одном документе могут лежать:

- экспериментальные пайплайны;
- мусорные проверки и черновики;
- готовые production-пайплайны;
- source-файлы библиотечных объектов;
- source-файлы executable pipelines;
- секции с независимыми пайплайнами.

Документ не равен workspace. Слово `project` лучше использовать осторожно, потому что в общей системе project может означать более крупный бизнес-контекст.

### Canvas

Canvas - способ смотреть на документ и работать с ним.

Это рабочая поверхность с нодами, секциями, связями, drag, zoom, контекстными меню и preview/edit режимами. Canvas сам по себе не является доменной сущностью, это UI-представление.

### Graph

Graph - техническое представление зависимостей и команд.

Продуктово его можно воспринимать как визуальное представление AST: ноды описывают действия, связи описывают передачу данных, а секции и пайплайны задают более крупные куски процесса.

### Pipeline

Pipeline - связанная последовательность нод, которая решает production-задачу.

В одном документе может быть несколько независимых пайплайнов. Pipeline может быть черновым, шаблонным или исполняемым.

### Executable Pipeline

Executable Pipeline - сохраненный пайплайн, который можно запускать из других частей продукта.

Примеры:

- кнопка генерации обложки статьи в админке сайта;
- автоматическая генерация поста при переносе карточки Kanban в статус `Generate`;
- reusable production-template для клиента или рубрики.

Executable Pipeline должен иметь входной контракт, выходной контракт, версию, origin document и список мест, где он используется.

### Section

Section - визуальная группа на canvas.

Сейчас секция может быть простой группировкой. В будущем секция может стать executable pipeline, если пользователь явно назначит ей эту роль. Тогда секция должна визуально отличаться и предупреждать, что ее изменение может повлиять на другие части workspace.

### Library

Library - workspace-level хранилище reusable объектов и пайплайнов.

В библиотеке будут жить:

- subjects: люди, персонажи, продукты, предметы, транспорт;
- locations: интерьеры, экстерьеры, сцены, места;
- styles;
- future scenes;
- executable pipelines;
- reusable pipeline templates.

Library item должен знать origin document, чтобы пользователь мог открыть исходный файл и отредактировать родительский объект.

### Publication Artifact

Publication Artifact - готовая контентная единица под конкретную площадку.

Это может быть Telegram post, VC article, Zen article, VK post, Instagram carousel, LinkedIn post, TikTok video post и так далее.

Publication Artifact может быть собран из готовых входов или сгенерирован publication-ноду как editorial assist.

### Kanban Card

Kanban Card - задача или черновик публикации в planning layer.

Publication Artifact можно отправить в Kanban как новую карточку или связать с существующей карточкой. В будущем из Kanban можно будет открыть исходный document / executable pipeline, который собрал эту публикацию.

## 4. Связь production layer с другими продуктами

Текущий production layer должен поддерживать несколько сценариев:

- пользователь вручную собирает пайплайн на canvas и экспортирует ассеты;
- пользователь сохраняет библиотечный объект и возвращается к origin document для редактирования;
- пользователь сохраняет pipeline template и переиспользует его в новом документе;
- пользователь делает pipeline executable и подключает его к Kanban, админке сайта или другому продукту;
- внешний продукт запускает executable pipeline с входными данными и получает publication artifact или asset.

Пример для сайта Gigonom:

1. В production canvas собирается pipeline генерации обложки статьи.
2. Pipeline сохраняется как executable template для конкретного клиента или рубрики.
3. В админке сайта кнопка "Generate cover" запускает этот pipeline с входными данными статьи.
4. Результат возвращается как image asset, пригодный для статьи.

## 5. Данные в графе

### Node output

Нода должна отдавать на выход финальный активный результат.

История генераций остается UX-механикой внутри ноды: пользователь может листать варианты, выбирать активный, открывать preview и сравнивать результаты. Downstream-ноды получают активный результат, если нет специального batch / iterator режима.

### Collections

Коллекции являются полноценным типом данных.

Примеры:

- image collection: несколько генераций внутри image-ноды;
- text collection: результат `Text Splitter`;
- object collection: набор subjects, locations или styles из библиотеки;
- publication collection: будущая серия публикаций.

Обычная нода не обязана автоматически обрабатывать всю коллекцию. По умолчанию она работает с активным элементом или с тем входом, который ей передан. Для перебора используется explicit iterator / batch layer.

### Iterator and batch

Iterator - явный механический слой, который выбирает элемент из коллекции и передает его дальше без потери смысла.

Batch Runner - будущий слой запуска всего downstream-пайплайна по коллекции или нескольким коллекциям.

Автоматически запускать генерацию downstream-ноды нельзя. Решение принимает пользователь. Если upstream-данные изменились, downstream-ноду нужно визуально пометить как outdated / needs regeneration.

### Lineage and run metadata

Полный lineage нужен, когда появится backend:

- provider;
- model;
- prompt;
- system instruction;
- input assets;
- settings;
- seed, если доступен;
- token usage;
- cost;
- result asset;
- user feedback;
- node and pipeline origin.

На фронтовом MVP достаточно показывать пользователю модель и физический размер изображения там, где это помогает ориентироваться.

## 6. Library architecture

Библиотека живет на уровне workspace.

Библиотечный объект связан с origin document. Если пользователь нажимает `Edit` в библиотеке, система должна открыть документ, где объект был создан и где лежит родительская сборка.

### Instance update flow

Если родительский объект изменился, а в других документах есть его инстансы, инстанс не должен обновляться молча.

Нужен UX:

1. Инстанс показывает предупреждение: parent changed.
2. Пользователь открывает diff.
3. Diff показывает было / стало: описание, паспорт, референсы, ключевые поля.
4. Пользователь выбирает:
   - update from parent;
   - keep current and detach from parent.

### Versioning

Версии нужны в будущем, но не обязательно в первом MVP библиотек.

Причина: subject, location или style могут деградировать после нескольких правок. Нужно иметь возможность вернуться к предыдущей версии или собрать новую версию из нескольких старых.

### Baked library object

Запеченный библиотечный объект содержит:

- id;
- type;
- name / working id;
- description;
- structured passport;
- semantic layers;
- mutable / immutable traits;
- primary reference images;
- additional reference images, если нужны для разных ракурсов и задач;
- origin document;
- version metadata позже.

История кадров, где объект использовался, не является reference по умолчанию. Это portfolio / usage history. Пользователь может вручную перенести удачный кадр в references.

## 7. Object contracts and semantic layers

Subject, Location, Style, Scene и будущие объекты должны иметь общий contract mechanism, но разные layer presets.

Пример subject layers:

- identity;
- gender / age / ethnicity, если релевантно;
- face;
- hair;
- body / silhouette;
- marks;
- clothing;
- accessories;
- immutable traits;
- mutable traits;
- negative constraints.

Пример location layers:

- environment type;
- spatial layout;
- architecture;
- surfaces / materials;
- scale cues;
- atmosphere;
- lighting baseline;
- mutable dressing;
- negative constraints.

Пользователь должен иметь возможность задавать custom layers на уровне конкретного builder object. Эти layers дальше работают как product tags:

- подсвечиваются в result fields;
- отображаются бейджами;
- могут включаться / выключаться;
- выключенный слой остается видимым в редакторе, но не идет на output.

Lexical можно использовать как основу rich text / structured editor, но продуктовые semantic tags должны быть нашим контрактом поверх него.

## 8. Publication nodes

Publication node является финальной product node, но технически может быть генеративной.

Она работает в двух режимах:

### Assembly mode

Нода собирает готовую публикацию из входов:

- title;
- body;
- images;
- video;
- captions;
- hashtags;
- CTA;
- metadata.

В этом режиме она валидирует ограничения площадки и показывает preview.

### Generation assist mode

Нода адаптирует или генерирует недостающие части:

- переписать текст под площадку;
- сократить до лимита;
- сделать заголовок;
- подготовить caption;
- адаптировать tone of voice;
- собрать публикацию из концепции и входных фактов.

Для Telegram, VC, Zen, VK, Instagram, TikTok и LinkedIn нужны отдельные platform-specific ноды или content-unit ноды, но внутри они должны использовать shared model, shared validators и shared UI pieces.

Future workflow:

- отправить publication artifact в Kanban;
- связать artifact с существующей Kanban card;
- создать draft в площадке;
- direct publishing через backend integrations.

## 9. Canvas UX principles

### Context menu

Контекстное меню должно быть единым по механике, но семантически разным:

- node menu;
- group menu;
- section menu;
- executable section menu;
- library object menu;
- library instance menu.

Общие действия: duplicate, rename, lock, delete, ask AI / help.

Node-specific действия: preview, download current, download all, remove generations, update library, detach instance и другие.

### Lock

Lock пока блокирует только перемещение.

Если нода locked внутри section, она остается locked относительно section. Сам section можно двигать, и locked-нода двигается вместе с ним.

### Fullscreen image editor

Preview, mask, curves, retouch, compare и future edit modes должны быть универсальным fullscreen image editor для всех image-like нод.

Ноды могут включать разные инструменты, но контейнер preview/edit должен быть общий.

### Collapse

Каждая нода должна иметь compact / collapsed mode с сохранением портов.

Section и group menu должны получить `Collapse all`, чтобы снижать когнитивную нагрузку на больших canvas.

## 10. Storage and backend direction

Сейчас локальный frontend хранит:

- graph metadata;
- UI state;
- image blobs в IndexedDB;
- project snapshot / pipeline template exports.

В будущем backend должен хранить:

- workspaces;
- documents;
- assets в S3-like storage;
- library objects;
- executable pipelines;
- publication artifacts;
- Kanban bindings;
- run metadata and cost;
- user permissions;
- schema migrations.

Миграции схемы нужны обязательно, потому что локальные и backend-документы будут жить дольше одной версии приложения.

## 11. AI service direction

Сейчас OpenRouter вызывается через Next API layer. Это правильно для frontend MVP, потому что ключ не попадает в browser bundle.

Когда появится backend, AI service должен переехать туда. Frontend не должен знать детали provider integration.

При этом текущие API routes стоит проектировать так, чтобы их было легко перенести в Nest / backend service:

- typed request / response contracts;
- clear provider abstraction;
- clear error taxonomy;
- strict system prompts by node type;
- explicit expected modality: text, image, structured JSON или publication artifact.

Если OpenRouter вернул ответ без нужной модальности, UI должен показывать понятную ошибку, а service layer должен уметь делать retry / fallback там, где это безопасно.

