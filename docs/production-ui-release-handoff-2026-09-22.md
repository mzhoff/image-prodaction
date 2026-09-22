# Production → UI Platform: выпуск текущих Media и Stories

22 сентября 2026. Подготовлено для передачи агенту; автоматически не отправлялось.
Цель — выпустить существующие функциональные изменения, без редизайна Production.

**Закрыто 22.09.2026:** Media `.5` и Stories `.6` опубликованы в private registry
и подключены exact-версиями в Production. [PR #7](https://github.com/PRODactionPRO/prodactionUI/pull/7)
слит, [release gate](https://github.com/PRODactionPRO/prodactionUI/actions/runs/35698784661)
и [main CI](https://github.com/PRODactionPRO/prodactionUI/actions/runs/35699287704)
прошли. Package source `3ee15be`, tag `production-ui-localization-2026-09-22`.
338 unit tests, React 18/19 и Next registry consumers проверены. Core/Tokens/
Onboarding и CSS не менялись. Ниже сохранено исходное задание до выпуска.

## Рабочие каталоги

- UI: `/Users/m.pyzhov/WORKSPACEs/Development/PRODaction/prodactionUI/Repos/prodactionUI`.
- Consumer: `/Users/m.pyzhov/WORKSPACEs/Development/PRODaction/image-prodaction/Repos/image-prodaction`.

## Блокер и нужная поставка

Production использует локальные `ui-media@0.1.0-canary-media.5` и
`ui-stories-editor@0.1.0-canary-stories.6`. Обе версии отсутствуют в GitHub Packages,
оба архива игнорируются Git. Registry доступен, остальные UI-пакеты скачиваются.

В UI checkout уже есть 24 изменённых tracked файла и четыре новых localization
source/test файла. Доработки в основном реализованы: их нужно проверить, собрать,
выпустить и вернуть точные версии, commit/tag, integrity и migration notes.
Откат к прежнему опубликованному canary потеряет используемые Production API.

## Проверить и сохранить

1. Экспорты из `./client`: `MediaLocalizationProvider`, `MediaTranslator`,
   `StoriesLocalizationProvider`, `StoriesTranslator`; host-owned `translate` и
   Intl `locale`, прежний RU fallback. Проверить типы именно после pack.
2. Media: gallery/viewer/carousel/dock, loading/error/retry, aria-labels,
   даты и единицы размера. Пользовательские имена файлов не переводятся.
3. Stories: shell, copy fields, layer editor, inspectors, filmstrip/picker,
   preview, structure/style. Locale change не вызывает document `onChange`,
   не переводит слой/заголовок, не сбрасывает выбранный слой или черновик.
4. `getStoriesSlideTitle(slide, index, fallback?)` сохраняет двухаргументную
   совместимость. Переводится fallback, а не текст пользователя.
5. Вложенный media picker получает перевод через общий Media provider.
   Production уже оборачивает оба provider в `src/shared/i18n/package-localization.tsx`.
6. Client/server boundaries, CSS exports, React 18/19 и пакетные peer dependencies
   работают после cold install, без импорта исходников из соседнего checkout.

## Совместимые зависимости

Сохранить поддержку текущих ui-core/ui-tokens `0.2.0-canary-reverie-20260910.2`,
ui-onboarding `0.1.0-canary-e7acbb144021425e797c0afdaa51cf99c6747783`,
React 19.2.7 и `@prodaction/stories-platform-contracts@3.0.0-canary.0` в Production.

В исходных manifests есть `workspace:^`/`catalog:`. В публикуемых dependency/peer
полях должны быть разрешимые версии. Stories Editor peer должен принимать
одновременно выпущенный Media. При переходе на stable изменить range вместе с
номерами, не оставить range только для local canary. Контракты Stories уже
доставляются отслеживаемым архивом; не менять schema/имя ради этой публикации.

## Ограничение владельца: оформление Production не менять

Палитра, opacity, blur, геометрия и радиусы Production сохраняются. Не заменять
их автоматически значениями общего UI. Допустима совместимость имён только с
идентичными computed styles до/после в light/dark и интерактивных состояниях.

В `check:reverie-ui` пять ссылок на три неизвестных upstream имени. Пробные
замены близкими PUI-цветами полностью отменены по указанию владельца:

| Место в Production | Текущий reference / fallback |
| --- | --- |
| `src/app/styles/aspect-ratio-selector.css` | `text-tertiary`, `#a6a6a6` |
| `src/app/styles/auth.css` | `accent-primary` в focus outline, без fallback |
| `src/features/graph-node/ui/nodes/generate-video-node.css` | `text-tertiary` без fallback |
| `src/features/graph-node/ui/timeline-media.css` | `text-tertiary`, fallback `text-secondary`, opacity `.55` |
| `src/features/graph-node/ui/voice-selector.css` | `text-accent`, `#204aff` |

Это naming/ownership несоответствие consumer, не заказ новых оттенков PUI.
Сначала зафиксировать computed styles реальных контролов в обеих темах, затем
ввести продуктовые имена/aliases с прежними значениями. Добавление одного общего
`text-tertiary` может выключить разные fallbacks и перекрасить интерфейс.
Не ослаблять проверку токенов, чтобы скрыть проблему.

## Acceptance и передача

Перепроверено на Node 24.15.0: Media 55 tests passed, Stories 27 passed,
typecheck и Biome lint обоих пакетов passed. Это source-check, не полный release gate.
За UI release остаются `pnpm check`, packed consumers, Next import/build,
publication и authenticated install точных версий.

Вернуть номера, commit/CI, artifacts, изменения публичного API и оставшиеся
ограничения. Production уберёт два `file:` reference, обновит lockfile, проверит
Library/viewer/Stories, locale switching и сохранность текущего оформления.
