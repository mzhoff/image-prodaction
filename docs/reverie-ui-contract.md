# Общий UI-контракт Reverie

Дата: 2026-09-10. Область: Production, Content Hub admin и Reverie Site.

Уточнение владельца 22 сентября 2026: текущие цвета и оформление Production
сохраняются при обновлении пакетов. Несовпадение с общим UI не является
основанием перекрашивать продукт. Совместимость имён/aliases допустима без
изменения фактических цветов обеих тем. Детали текущей поставки:
[проверка пакетов](./package-release-readiness-2026-09-22.md).

## Решение

Единственный источник оформления — `@prodactionpro/ui-tokens` (DTCG → CSS),
единственный источник общих примитивов — `@prodactionpro/ui-core`.
Продукты сохраняют свои маршруты, данные, права, авторизацию и бизнес-компоненты.
Это consumer-интеграция, а не новый сервис или перенос ownership между продуктами.

Общий профиль `reverie` определяет поверхности, текст, границы, акцент, статусы,
геометрию и типографику. Значения палитры можно менять в библиотеке, не заменяя
цвета по трём репозиториям. Смена версии библиотеки остаётся проверяемым релизом,
а не незаметным обновлением по плавающему `latest`.

## Публичные имена

- `--pui-semantic-surface-{canvas,primary,secondary,elevated,hover,selected,inverse,overlay}`.
- `--pui-semantic-text-{primary,secondary,muted,on-accent,on-inverse}`.
- `--pui-semantic-border-{default,subtle,focus}`.
- `--pui-semantic-accent-{default,hover,soft,foreground,highlight}`.
- `--pui-semantic-status-{success,warning,danger,info}-{foreground,background,border}`.
- `--pui-semantic-dataflow-*`: тип данных порта, отдельно от брендового акцента.
- `--pui-radius-{control,card,popup,full}` и `--pui-font-family-sans`.

Синий означает основной акцент; зелёный success не заменяется на синий.
Аудио остаётся сиреневым, видео оранжевым, текст зелёным. Эти роли имеют
контрастные значения для каждой темы. Геометрия общих контролов опирается на
Content Hub; служебная типографика компактная. Маркетинговые заголовки сайта
и собственно авторский контент не принуждаются к размеру кнопки или формы.

## Тема

Корневой `ReverieThemeProvider` и `getThemeInitScript()` используют один контракт
`light | dark | system`. Ранний скрипт читает настройку до отрисовки; root layout
не становится динамическим только ради темы. Скрипт не содержит пользовательский HTML.
Настройка `pui-theme` — не токен авторизации, а несекретное предпочтение интерфейса.

Cookie общая для одного hostname (включая разные локальные порты); localStorage
и BroadcastChannel синхронизируют вкладки одного origin. Возврат фокуса перечитывает
cookie. `localhost` и `127.0.0.1`, а также разные домены — разные cookie-хранилища.
Междоменное/account-level предпочтение требует отдельно утверждённого identity
контракта; здесь такой сервис не создаётся и широкая cookie Domain не выставляется.

Переключатель доступен на входе, в sidebar, настройках аккаунта и на панели канваса.
Состояние темы не входит в snapshot графа и не запускает сохранение документа.

## Компоненты и иконки

PrimaryActionButton использует реальный PUI Button, PromptBox — TextareaControl,
текстовые поля страниц — Input/TextareaControl. Нативные refs/events, выделение,
drag-and-drop текста, типы number/date и form semantics сохраняются.
Специальные графовые порты, слайдеры с центральным нулём и редакторы остаются
продуктовыми компонентами, но используют общие токены.

Иконки берутся из `@prodactionpro/ui-core/icons`: именованный совместимый API
поверх Hugeicons, статические импорты отдельных glyphs, tree shaking.
ChatModule 0.12 не имеет icon injection API. Явный Next webpack/Turbopack alias
`lucide-react → @prodactionpro/ui-core/icons` заменяет только его UI-импорты;
исходники зависимостей не копируются и не патчатся. Семейство chat-пакетов
остаётся одной точной версии 0.12.0. После появления upstream icon adapter
этот совместимый alias можно удалить.

## Исключения из тематизации

Изображения, видео, маски, RGB-кривые, значения цветовых палитр и пользовательский
рисунок не перекрашиваются. Фотопросмотр, чёрные поля видео и белые подписи на
чёрном медиа-scrim сохраняют фиксированный контраст. Не применяется CSS invert.

## Поставка и проверки

Проверять одну exact cohort ui-core/ui-tokens и registry integrity в consumers.
Старый onboarding сохраняется без правок его бизнес-потока, если совместим peer range.
Локальная проверка packed artifacts не равна публикации и не заменяет lock-файл.
Не ослаблять registry-only guard Content Hub ради локальной сборки.

QA: light/dark/system и reload, portals/dialogs, settings, библиотека, canvas,
фото-контраст, символы портов, native form semantics, мобильная ширина,
отсутствие гидрационных ошибок и нулевая платная генерация во время UI-тестов.

### Поставка в Image Production 2026-09-10

Пара `ui-core` + `ui-tokens` версии `0.2.0-canary-reverie-20260910.2`
**опубликована в приватном GitHub Packages** с отдельным тегом `reverie-canary`.
Опубликованы только два проверенных tarballs: onboarding, существующий `canary`
и `latest` не изменялись. Registry integrity совпадает с проверенными архивами.
Image Production использует exact registry-зависимости и обновлённый lock-файл;
чистый `npm ci` внутри Docker и production build прошли.

- UI Platform: полный `pnpm check`, 207 core + 40 onboarding тестов,
  установки packed consumer с React 18/19, Next.js production build + HTTP smoke,
  визуальная проверка Hugeicons и light/dark dataflow-цветов.
- Production: typecheck, lint, architecture, 863 активных теста (10 skipped),
  7 тестов установщика, `check:reverie-ui` (52 CSS), проверка единой версии
  14 ChatModule-пакетов (0.12.0). Три Chrome E2E на пересобранном рабочем web:
  общая тема, групповое меню/расстановка/одна отмена и carousel Export.
  Переключение Export дополнительно проверено в пользовательском проекте через
  proxy 7310. Платная генерация не запускалась.
- Content Hub: ранее адаптированные исходники admin/editor-core не пересобирались
  в этом срезе. Registry-only guard не обходился; собственные install/build/QA
  потребителя остаются отдельной проверкой. Связь Runtime v2 после перезапуска
  Image Production проверена: 1 соединение, 7 grants, 5 pipelines.
- Reverie Site: ранее проверены 34 pure-теста и статические проверки; собственные
  registry install/build и браузерный QA не входят в эту поставку Image Production.

При проверке Production остаётся прежнее Next NFT warning по video-processor;
сборку оно не блокирует. Проверка UI не является отдельным аудитом безопасности.

Рабочий `image-prodaction-web-1` пересобран и заменён в том же Compose-проекте:
HTTP 200/ready на 3004 и 7310. Сохранены integration overlay, сеть Content Hub
и alias `image-production-api`; межконтейнерный healthcheck также HTTP 200.
Другие сервисы, базы, volumes и пользовательские графы не пересоздавались.

Установщик и BuildKit используют отдельный read-only токен из Keychain.
Публикующий токен хранится отдельно и не передаётся в установку или runtime.
Порядок доступа: [private-packages.md](./private-packages.md).
Точные артефакты, проверки и оставшиеся ограничения:
[протокол поставки](./reverie-ui-release-2026-09-10.md).
