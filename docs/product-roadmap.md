# Reverie Production Layer: product roadmap

Дата: 2026-06-06

## 1. Принцип планирования

Двигаемся не по жесткому fixed scope, а по правилу:

> Максимум продуктовой пользы за минимальную сложность, но без архитектурных решений, которые придется выбрасывать через неделю.

Текущий продукт уже можно развивать как самостоятельный production canvas. Параллельно он должен готовиться к роли модуля внутри большой системы контент-маркетинга: workspace, libraries, executable pipelines, Kanban, publishing и analytics.

Основной концепт зафиксирован в [product-architecture.md](./product-architecture.md).

## 2. Что уже является фундаментом

Фундамент текущего production layer:

- node-based canvas;
- image import / preview / export;
- image generation;
- image extraction into semantic layers;
- text prompt / concat / generation / splitter;
- batch-like multi-export;
- iterator foundation;
- crop / adjustments / curves / retouch / refine;
- subject builder foundation;
- location builder foundation;
- local document persistence and portability;
- pipeline template export / import;
- Lexical foundation for future rich text editing.

Часть этого уже реализована как рабочий код, часть еще требует стабилизации, унификации UI и нормального product contract.

## 3. Priority 0: stabilization before bigger product layers

Перед тяжелым наращиванием публикаций и executable pipelines нужно закрыть несколько долгов, которые могут мешать:

1. Local persistence stability.
   - Проверить, почему после обновлений локальный документ иногда открывается как дефолтный.
   - Убедиться, что schema migrations не ломают старые локальные графы.
   - Разделить document data и transient UI runtime state.

2. Builder UI consistency.
   - Subject Builder и Location Builder должны иметь общий композиционный паттерн.
   - Library, Inputs, References, Description, Passport, Constraints должны идти по одной логике.
   - Входные порты должны стоять напротив соответствующих input rows.

3. Shared image fullscreen editor.
   - Preview, mask, curves, retouch и future compare должны жить в одном универсальном image editor.
   - Ноды должны включать нужные режимы, а не копировать fullscreen implementation.

4. Node menu and context menu.
   - Разделить canvas menu, node menu, group menu, section menu, executable section menu.
   - Добавить базовые действия: duplicate, rename, lock, delete.
   - Для image-like нод: preview, download current, download all, remove generations.

5. Error model.
   - Описать типовые ошибки OpenRouter и provider responses.
   - Показывать человеческие ошибки в карточке ноды.
   - Обработать случай "provider ответил, но нужного image payload нет".

Этот блок не должен остановить разработку новых функций, но его нужно закрывать параллельно, чтобы не копить ломкий UX.

## 4. Priority 1: Library object layer

Цель: превратить Subject / Location / Style в reusable production entities, а не просто отдельные ноды.

### 1.1 Unified builder model

Сделать общий подход для builder nodes:

- Library block;
- Inputs block;
- Reference preview / generated profile shots;
- Generate Description;
- Description;
- Passport;
- Constraints;
- Publish / Update Library.

Subject Builder, Location Builder и будущий Style Builder должны отличаться contract presets, а не базовой компоновкой.

### 1.2 Object contracts

Добавить универсальный слой object contracts:

- object type;
- custom semantic layers;
- mutable / immutable flags;
- output-enabled flags;
- structured passport;
- text rendering for prompt assembly;
- Lexical-compatible structured content later.

### 1.3 Library importer nodes

Builder и Importer должны быть разными нодами:

- Builder создает и публикует объект в библиотеку.
- Importer подключает готовый объект из workspace library.

Importer должен поддерживать detach / override / update-from-parent в будущей версии.

## 5. Priority 2: Collections, iterator and batch runner

Цель: поддержать production-сценарии, где пользователь перебирает десятки изображений, текстов, subjects или locations.

### 2.1 Collections as first-class graph values

Зафиксировать типы:

- image collection;
- text collection;
- subject collection;
- location collection;
- style collection;
- publication collection later.

### 2.2 Iterator node

Iterator должен работать как механический selector / router:

- принимает коллекцию;
- выбирает active item;
- выдает item наружу с сохранением типа;
- поддерживает manual previous / next;
- не запускает downstream generation автоматически.

### 2.3 Batch Runner

Batch Runner - отдельный будущий слой, не просто UI в iterator.

Он должен:

- запускать downstream pipeline по всем элементам коллекции;
- показывать progress на canvas;
- позволять остановить весь run;
- фиксировать partial results;
- не пропускать отдельные элементы в automatic full-pipeline mode;
- иметь стратегию для нескольких коллекций: shortest, longest with wrap, all combinations, random.

Стратегии multiple collections нужно проектировать отдельно после UX-макета.

## 6. Priority 3: Publication layer

Цель: получить первую готовую content unit, а не просто ассет.

### 3.1 Publication core

Спроектировать:

- `PublicationArtifact`;
- platform constraints;
- validation result;
- attachment model;
- output contract;
- export package;
- Kanban handoff placeholder.

Статус на 2026-06-06: стартовое доменное ядро добавлено в код. Уже есть тип `PublicationArtifact`, модель attachments/components, registry площадок и content units, базовые constraints и чистый validator без UI-зависимостей. Следующий шаг - publication node UI и первый end-to-end формат Telegram.

### 3.2 First node: Telegram Article

Первым end-to-end форматом взять `Telegram Article` или `Telegram Post`, потому что:

- формат проще, чем VC / Zen article;
- сразу нужен rich text / Lexical;
- можно проверить text + image assembly;
- понятно валидировать длину, картинки, links, CTA.

### 3.3 Publication modes

Поддержать два режима:

- Assembly: собрать из готовых входов и проверить.
- Generation Assist: адаптировать / сократить / переписать / сгенерировать недостающие части.

### 3.4 Next formats

После Telegram:

1. VC Article;
2. Zen Article;
3. VK Post;
4. Instagram Carousel;
5. LinkedIn Post;
6. TikTok / video post после video layer.

## 7. Priority 4: Executable pipelines

Цель: сделать canvas не только редактором, но и фабрикой reusable automation.

### 4.1 Executable section

Section может стать executable pipeline, если пользователь явно назначил ей эту роль.

Нужно добавить:

- visual state: executable section;
- input contract;
- output contract;
- version;
- origin document;
- usage references;
- warning before editing used executable pipeline.

### 4.2 Pipeline library

Pipeline templates и executable pipelines должны жить в workspace library.

Отличие:

- template можно скопировать и доработать;
- executable pipeline можно запускать из других модулей.

### 4.3 External launch points

Будущие точки запуска:

- Kanban card status change;
- admin panel button;
- publication workflow;
- batch generation task;
- API endpoint.

## 8. Priority 5: Backend handoff

Backend станет нужен для авторизации, workspace, документов, библиотек, assets, publication artifacts и run metadata.

Frontend MVP должен быть готов к переносу:

- typed API contracts;
- stable project schema;
- migrations;
- separation of graph state and runtime UI state;
- no provider details inside UI components;
- clear AI service boundary.

Минимальные backend entities:

- workspace;
- user;
- document;
- asset;
- library object;
- executable pipeline;
- publication artifact;
- kanban card binding;
- generation run.

## 9. Priority 6: Visual LUT Builder and color look

Перед video layer нужно закрыть отдельный image/color блок:

- Visual LUT Builder / Color Look node;
- простая "color warp" сетка вместо профессионального color grading UI;
- понятные пресеты: clean product, warm editorial, cold tech, cinematic contrast, soft film, brand preset;
- один базовый контроль `strength`;
- WebGL preview для интерактивного просмотра;
- экспорт / импорт LUT в одном выбранном формате после отдельного выбора между `.cube`, `.3dl` и другими форматами.

Этот блок должен быть проще, чем профессиональные LUT-редакторы: пользователь меняет визуальный look быстро и понятно, а технические термины остаются внутри реализации.

## 10. Priority 7: Video and timeline handoff

Когда image / text / publication foundations станут устойчивыми:

- video generation nodes;
- first frame / last frame workflow;
- video asset history;
- video export;
- handoff to timeline editor;
- publication nodes with video attachments.

Video layer должен использовать те же principles: graph values, library entities, publication artifacts and backend run metadata.

## 11. Priority 8: Analytics and HADI loop

После появления publication artifacts и publishing / Kanban integration:

- связать published content с исходным pipeline;
- хранить goals / hypotheses;
- собирать platform metrics;
- сравнивать результат с ожиданиями;
- рекомендовать следующий production cycle;
- возвращать insights в strategy layer.

Это не задача текущего frontend MVP, но архитектура должна сохранять traceability от publication artifact к source pipeline.

## 12. Практический порядок ближайших работ

Рекомендуемый порядок после фиксации этого плана:

1. Закрыть критичные проблемы стабильности локального документа и миграций.
2. Унифицировать Subject Builder / Location Builder по общему builder pattern.
3. Зафиксировать object contract model для library entities.
4. Довести iterator до понятного manual selector для image / text / object collections.
5. Начать publication core: `PublicationArtifact`, constraints, validation.
6. Сделать первую publication node на Telegram.
7. Добавить export package / Kanban handoff placeholder.
8. Вернуться к executable sections как к следующему крупному automation layer.
9. До перехода к video layer реализовать простой Visual LUT Builder / Color Look node.

Если нужна максимальная быстрая продуктовая демонстрация, можно начинать с Telegram publication node сразу после минимального contract design. Но без пунктов 1-3 publication layer быстро начнет тянуть хаос из builder и storage слоев.
