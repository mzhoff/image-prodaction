# Общий Media UI и адаптер Image Production

Image Production использует `@prodactionpro/ui-media/client` для полноэкранного
просмотра и раскладки медиатеки. Общий пакет отвечает за карусель, миниатюры,
движение, клавиатуру, модальное окно и строки галереи.

Старые пути `lib/image-viewer-{dock,motion,release,thumbnail-window}` сохраняются
как реэкспорты общего пакета: существующие импорты и regression tests продолжают
работать, а алгоритмы имеют один источник. Hook `use-image-viewer-motion` также
реэкспортирует общий контроллер. Группировка по датам, раскладка строк и формат
размера/даты в `pages/library/lib/library-gallery` используют общие функции и
сохраняют тип `LibraryAssetItem` потребителя. `use-image-viewer-gesture` — тонкий
адаптер общего hook: передаёт состояние открытого контекстного меню продукта,
не дублируя расчёт жестов.

В продукте остаются:

- `ImageViewer` как совместимый вход для текущих canvas nodes и Library;
- `useImageViewerItems`: разрешение URL удалённых assets и ограниченного окна
  миниатюр старых IndexedDB assets, освобождение временных object URLs;
- `useImageViewerMaskModule`: canvas маски, кисть, ластик, история, prompt,
  выбор модели и существующий callback генерации;
- `createImageViewerPanelModule`: независимое подключение Curves, Adjustments,
  панели действий Library и собственного media preview;
- `LibraryCard`: Next Link, фильтры навигации, контекстное меню и действия над
  продуктовым asset.

`MediaItem.id` сохраняет ID текущей истории. Выбор ID переводится обратно в
индекс через `onSelectVersion`; отдельные callbacks перехода назад/вперёд
сохранены. Хост передаёт готовые оригиналы и миниатюры. Общий пакет не знает
маршрутов `/api/assets`, IndexedDB, Workspace, документов или моделей AI.

Маска передаётся как отдельный `MediaViewerModule`; закрытие её панели оставляет
canvas смонтированным. Включённое рисование блокирует навигацию просмотрщика.
Curves/Adjustments сохраняют своё состояние и применение в исходных node models.
Извлечение UI не меняет node settings, ports, runtime, API, хранение и права.
Миграция пользовательских данных не требуется.

Проверки потребителя: focused unit tests `image-viewer-media-items.test.ts` и
`image-viewer-panel-module.test.ts`, затем `npm run typecheck`, `npm run lint`,
`npm run check:architecture`. Проверки интерфейса на сервере с новым пакетом:
`e2e/color-correction-viewer.spec.ts` (маска и боковые панели, платные POST
блокируются), `e2e/library-dock.spec.ts`, `e2e/library-image-reuse.spec.ts` и
`e2e/library-viewer-layout.spec.ts`. Проверка старого Docker bundle не подтверждает
эту интеграцию.

## Локальная поставка 10 сентября 2026

Используется собранный архив `0.1.0-canary-media.4` из `.local-packages/`,
одинаковый с Content Hub (SHA-256
`c41c5d5cfbfba0a23e91cb7d8aa168f3ec63de5049593ccd5b673b75ca87c8bc`).
GitHub Packages публикация ещё не выполнена: перед merge заменить file dependency
на выпущенную exact canary-версию, обновить lock и повторить `npm ci`/сборку.
Архив игнорируется Git, поэтому текущая поставка предназначена для локального
тестирования, а не чистого CI checkout.

Dockerfile временно поддерживает архивы через read-only build-context mount;
credential приходит только через BuildKit secret. После registry-перехода
архивы не требуются. Локальный web пересоздаётся существующим Compose project
с `compose.integration.yaml`, без пересоздания worker, базы или volumes.

Существующие старые carousel/dock UI-файлы пока сохранены, поскольку рабочее
дерево содержит параллельные изменения. Рабочий `ImageViewer` их не импортирует;
удалять их следует отдельным проверенным cleanup после сведения WIP.

Итоговые проверки `.4`: четыре браузерных сценария выше пройдены. Дополнительно
пройдены 33 focused unit tests адаптера/алгоритмов, typecheck, scoped ESLint,
architecture check и Docker production build. Проверка Next Image выявила
повторный запрос выбранного оригинала при движении: обработчик onError
стабилизирован в общем пакете; E2E подтверждает отсутствие таких запросов.

Финальный локальный web image:
`sha256:259155428048e82bc733eec7e7807c799b4ddb91ad8625985eda0b7baaac4e98`.
Контейнер healthy, Content Hub читает health endpoint по Docker alias и успешно
проверяет Runtime v2 catalog с существующими credentials. Генерация не запускалась.
Зависимости имеют отдельный audit debt (9 advisories), не исправляемый скрыто
через `npm audit fix --force` в рамках переноса UI.
