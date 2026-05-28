# Reverie Image Production Pipeline: MVP plan

Дата: 2026-05-28

## 1. Что строим

Делаем быстрый прототип нодового редактора для AI image production. Простыми словами: пользователь собирает "схему производства изображения" из карточек-узлов. Один узел загружает референс, второй вытаскивает из него стиль или композицию, третий смешивает несколько входов, четвертый генерирует новое изображение.

Главная идея продукта: один и тот же референс должен быть не просто картинкой, а источником отдельных управляемых свойств:

- style reference
- composition reference
- character / actor reference
- action / scene reference
- lighting reference
- camera / pose reference
- color / palette reference
- mood reference
- text / OCR result
- product / object reference
- background reference

Для MVP фокусируемся на image workflow. Видео, аудио, продвинутый композитинг, маски и полноценный production-management оставляем как расширение той же архитектуры, но не пытаемся реализовать сразу.

## 2. Что изучено

### Figma

Файл: https://www.figma.com/design/UA1XIcYdD0DUr5gPCSGUQm/REVERIE-img-prodaction-pipeline?node-id=0-1

В макете уже есть правильная базовая метафора:

- `Import` node: загрузка изображения и/или промпта.
- `ImageToText` node: анализ изображения и выдача текстового результата.
- `NanoBanana` / generation node: генерация изображения по prompt, settings и reference image.
- `Composing` node: сборка нескольких смысловых входов (`Actors`, `Actions`, `Composition`, `Style`, `Metaphore`) в один generation prompt.
- Связи между узлами показаны как линии между портами.

### Референсный проект prodSQL

Путь: `/Users/m.pyzhov/WORKSPACEs/Development/PRODaction/prodSQL/Repos`

Оттуда стоит взять не предметную область, а UX-паттерны канваса:

- pan / zoom: `src/shared/ui/useCanvasNavigation.ts`
- выделение рамкой: `src/shared/ui/useCanvasBoxSelection.ts`
- контекстное меню: `src/shared/ui/useContextMenu.ts`, `src/shared/ui/ContextMenu.tsx`
- drag узлов и групп: `src/pages/workspace-layout/model/useWorkspaceIdef0Canvas.ts`
- отрисовка связей поверх канваса через SVG: `src/pages/workspace-layout/ui/WorkspaceIdef0Canvas.tsx`
- Zustand-подход к состоянию и локальная модель рабочего пространства.

Вывод: для MVP лучше не брать тяжелую готовую node-editor библиотеку. У нас уже есть рабочий паттерн канваса, который можно адаптировать под image production. Это даст больше контроля над поведением карточек, портов и будущих video/audio nodes.

## 3. Предлагаемый технологический стек

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- lucide-react для иконок
- Zustand для состояния графа
- Zod для проверки структурированных данных от AI

Почему так: Next.js дает и UI, и маленькие server endpoints внутри одного проекта. Это не "большой бэкенд", но позволяет не светить OpenRouter API key в браузере.

### Канвас

- Свой canvas layer на React, по паттернам prodSQL.
- CSS transforms для pan / zoom.
- Абсолютно позиционированные node cards.
- SVG layer для связей.
- Типизированные ports: `image`, `text`, `preset`, позже `mask`, `video`, `audio`.
- Undo / redo через историю снимков графа.

### Локальное хранение

- Metadata графа: Zustand persist.
- Изображения: IndexedDB, лучше через небольшой wrapper типа Dexie.
- Превью: runtime `objectUrl`, который пересоздается из Blob при открытии проекта.
- Экспорт проекта: JSON + assets bundle на следующем этапе.

Почему не `localStorage` для картинок: он плохо подходит для больших файлов. Изображения быстро раздувают размер данных, а IndexedDB рассчитан именно на Blob/File.

### OpenRouter

- Вызовы делать только через Next route handlers, например:
  - `POST /api/ai/analyze-image`
  - `POST /api/ai/compose-prompt`
  - `POST /api/ai/generate-image`
- Ключ хранить в `.env.local` как `OPENROUTER_API_KEY`.
- Модели не хардкодить в UI-компонентах. Нужен `model-registry.ts`, где можно менять модель без переписывания узлов.
- Для image input использовать URL только для публичных файлов. Для локальных/private файлов использовать base64 data URL.
- Для image generation выбирать модели через OpenRouter models API по `output_modalities=image`.
- Результат image generation может приходить как base64 data URL в `message.images`, поэтому его нужно сразу конвертировать в Blob и сохранять в IndexedDB.

## 4. Почему пока без базы, авторизации и MinIO

На старте нам важнее доказать механику редактора: можно ли удобно собрать граф, вытащить из картинки нужные свойства и сгенерировать новый результат.

База данных, авторизация и S3/MinIO нужны, когда появятся:

- несколько пользователей;
- общие проекты;
- командная история изменений;
- большие библиотеки ассетов;
- стабильная production-инфраструктура.

Для локального закрытого прототипа достаточно IndexedDB. MinIO можно добавить позже как замену локальному хранилищу файлов, когда поймем, что workflow работает.

Важно: даже без "полноценного бэкенда" OpenRouter key не должен попадать в browser bundle. Поэтому тонкий server endpoint в Next.js нужен уже в MVP.

## 5. MVP: первая рабочая вертикаль

Цель первой версии: пользователь может загрузить референс, извлечь из него отдельное описание, подключить это описание к генератору и получить новое изображение.

### Node types для MVP

1. `ImportImageNode`
   - Загружает изображение.
   - Показывает preview.
   - Выдает output port `image`.

2. `TextPromptNode`
   - Содержит ручной prompt.
   - Выдает output port `text`.

3. `ImageToTextNode`
   - Принимает `image`.
   - Имеет режим анализа: `style`, `composition`, `actors`, `actions`, `lighting`, `camera`, `color`, `mood`, `ocr`.
   - Возвращает структурированный текстовый preset.
   - Выдает output port `preset`.

4. `ReferenceComposerNode`
   - Принимает несколько `preset` и `text`.
   - Раскладывает входы по ролям: `Actors`, `Actions`, `Composition`, `Style`, `Lighting`, `Metaphor`.
   - Собирает финальный prompt.
   - Выдает output port `text`.

5. `GenerateImageNode`
   - Принимает prompt и optional image references.
   - Имеет settings: model, aspect ratio, size, seed/variations позже.
   - Запускает генерацию через OpenRouter.
   - Сохраняет результат как asset.
   - Выдает output port `image`.

6. `PreviewNode`
   - Показывает итоговое изображение или выбранный asset.
   - Нужен, чтобы не перегружать generator node историей результатов.

## 6. Базовая модель данных

```ts
type GraphProject = {
  version: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
  assets: AssetRecord[];
  presets: PresetRecord[];
  runs: RunRecord[];
};

type GraphNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  data: unknown;
  status?: 'idle' | 'running' | 'success' | 'error';
};

type GraphEdge = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
};

type AssetRecord = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  storage: { type: 'indexeddb'; blobKey: string };
};

type PresetRecord = {
  id: string;
  role: 'style' | 'composition' | 'actor' | 'action' | 'lighting' | 'camera' | 'color' | 'mood' | 'ocr' | 'metaphor';
  title: string;
  text: string;
  sourceAssetId?: string;
};
```

Смысл этой модели: граф можно сначала хранить локально, а потом почти без переписывания перенести в backend/database. Узлы, связи, ассеты и результаты уже разделены.

## 7. Этапы реализации

### Этап 0. Подготовка проекта

- Создать Next.js app в текущем репозитории.
- Настроить TypeScript, Tailwind, ESLint.
- Добавить базовую структуру `src/app`, `src/features`, `src/entities`, `src/shared`.
- Добавить `.env.example` с `OPENROUTER_API_KEY=`.

### Этап 1. Канвас без AI

- Перенести/адаптировать canvas navigation из prodSQL.
- Добавить node card renderer.
- Добавить drag узлов.
- Добавить порты и линии связей.
- Добавить selection, box-selection, context menu.
- Добавить undo / redo.
- Сохранять граф между перезагрузками.

Критерий готовности: можно создать несколько карточек, соединить их линиями, перетаскивать, выделять, удалять и перезагрузить страницу без потери графа.

### Этап 2. Локальные изображения

- Добавить upload image.
- Хранить Blob в IndexedDB.
- Показывать thumbnail в node card.
- Добавить preview node.
- Добавить clear/delete asset.

Критерий готовности: загруженная картинка остается после перезагрузки браузера.

### Этап 3. Image-to-text через OpenRouter

- Добавить route handler `/api/ai/analyze-image`.
- Сделать шаблоны анализа по ролям: style, composition, actors, lighting и т.д.
- Возвращать структурированный JSON.
- Валидировать ответ Zod-схемой.
- Показывать результат в node card и сохранять как preset.

Критерий готовности: из одной картинки можно получить отдельно описание композиции и отдельно описание стиля.

### Этап 4. Reference composer

- Добавить node, который принимает несколько presets.
- Добавить UI выбора роли входа.
- Добавить конфликтующие ограничения: например "не копировать одежду", "не переносить текст".
- Собрать финальный prompt.

Критерий готовности: пользователь может взять стиль из одного изображения, композицию из другого и ручной текстовый запрос.

### Этап 5. Image generation

- Добавить route handler `/api/ai/generate-image`.
- Подключить выбранную модель генерации через OpenRouter.
- Сохранять результат в IndexedDB.
- Показывать run status: running, success, error.
- Добавить историю результатов генерации.

Критерий готовности: граф реально производит новое изображение из prompt + references.

### Этап 6. Preset library

- Сохранять удачные style/composition/actor presets.
- Давать имя preset.
- Повторно подключать preset в новый граф.
- Экспортировать/импортировать проект JSON.

## 8. Что сознательно не делаем в первом MVP

- Авторизация.
- Общая база данных.
- Team collaboration.
- MinIO/S3.
- Видео generation.
- Audio nodes.
- Mask editor.
- Inpainting/outpainting.
- Production календарь и approval flow.

Это не потому, что эти части не нужны. Просто они не отвечают на главный первый вопрос: работает ли сам node-based image production workflow.

## 9. Риски и открытые вопросы

Главные продуктовые и технические риски вынесены отдельно: [mvp-risks-and-questions.md](./mvp-risks-and-questions.md).

## 10. Мой рекомендуемый старт

Начать с этапов 0-2: поднять Next.js app, перенести canvas UX из prodSQL и сделать локальные image nodes без AI.

Почему именно так: AI-интеграция имеет смысл только когда базовая рабочая поверхность уже удобная. Если сначала подключить генерацию, но канвас будет неудобным, мы не поймем, проблема в модели или в инструменте.

После этого подключать ImageToText. Это самый важный AI-узел, потому что он превращает картинку в управляемые свойства. Когда он заработает, generation node станет логичным продолжением, а не отдельной кнопкой "сгенерировать".

## 11. Ссылки на документацию

- OpenRouter image inputs: https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
- OpenRouter image generation: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- OpenRouter models API: https://openrouter.ai/docs/guides/overview/models
- Next.js App Router project structure: https://nextjs.org/docs/app/getting-started/project-structure
