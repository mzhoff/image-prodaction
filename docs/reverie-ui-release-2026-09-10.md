# Reverie UI: локальная поставка в Image Production

Дата: 2026-09-10. Это выполненная приватная artifact-публикация и обновление
локального web, а не commit/PR, запуск общего release workflow или deployment
Content Hub/Reverie Site.

## Артефакты

Оба пакета опубликованы с private visibility в `npm.pkg.github.com`:

- `@prodactionpro/ui-tokens@0.2.0-canary-reverie-20260910.2` — 15741 bytes;
  integrity `sha512-AVIc6QgkgpqL8SRQlzjcUuu/MAaRCTvpaNaK7zWkNqKJLXPGdKdJqxSDzSHulBw0TMh8V/VkJsyzTOcg4syx0w==`.
- `@prodactionpro/ui-core@0.2.0-canary-reverie-20260910.2` — 200427 bytes;
  integrity `sha512-YN3W9wpxPOohTwcVmaaN9p6/LzUU6/h3F6RtQgxiznGZQtq+z8s0TCTprDwWgEMOcU8I8KJEr3nuz9j4+dAB3w==`.

После публикации registry metadata и integrity перечитаны и сверены с двумя
проверенными tarballs. Тег `reverie-canary` указывает на указанную exact-версию;
существующий `canary` и `latest` не изменены, onboarding не опубликован.

В `package.json` закреплены exact-версии; `package-lock.json` содержит registry
URLs и integrity, без file/workspace-подмен. Добавлены 44 lock entries;
версии уже существовавших lock dependencies не изменились. Все 14 ChatModule
пакетов остаются на 0.12.0.

## Проверки

- `npm run typecheck`, `npm run lint`, `npm run check:architecture` — успешно.
- `npm run check:reverie-ui` — 52 stylesheets; `check:chatmodule-versions` — успешно.
- `npm run test:private-packages` — 7/7.
- `npm test` — 873 tests: 863 passed, 10 skipped, 0 failed.
- Чистый `npm ci` из registry и Next production build в Docker — успешно.
- Chrome E2E на `http://localhost:3004`: `canvas-batch-connect.spec.ts`,
  `export-image-carousel.spec.ts`, `reverie-theme.spec.ts` — 3/3.
- На рабочем proxy `http://127.0.0.1:7310` в проекте
  `01a08a4f-29a7-7ff4-abea-180fe0d7ebe4` доступны Previous/Next export image;
  клик Next изменил локальный preview с `1 of 2` на `2 of 2`.

Платная генерация не запускалась. Browser E2E используют отдельные QA-данные;
проверка пользовательского проекта ограничена просмотром и переключением preview.

## Рабочий контейнер

Обновлён только `image-prodaction-web-1`, стабильный тег
`image-prodaction-web:codex-local`.

- Предыдущий image ID: `sha256:44e70b10467f33afe3c5cd6ed60f92a164b1e5eab2b39058d7e94d2075e19798`.
- Новый image ID: `sha256:49087ad9f36afb0f69a8b67716a7f75048ecfe4bdc8e7b5ab57e76ea2b36b467`.
- Для build/up использованы `compose.yaml`, `compose.integration.yaml`,
  `compose.private-packages.yaml`; up — `--no-deps --no-build --wait`.
- Runtime package versions проверены внутри контейнера: оба пакета новой exact-версии.
- Container healthy; `/api/health/ready` на 3004 и 7310 — HTTP 200,
  database/objectStorage — ok.
- Сеть `prodaction-services-local` и alias `image-production-api` сохранены.
  Из `ludimogut-api` internal healthcheck — HTTP 200; Runtime v2 read-only проверка
  client identity, grants и catalog — 1 активное/проверенное соединение,
  7 grants, 5 pipelines. Tokens, grants и bindings не изменялись.

Миграции уже были применены (28, до 0027); новые миграции не запускались.
Workers, Content Hub, Reverie Site, базы и volumes не пересоздавались.
Накопленные исходники других агентов сохранены, новых копий/worktree нет.

До сборки свободно 60 GiB на внутреннем диске (ниже порога 15%; пользователь
предупреждён), после сборки — 57 GiB. После подтверждения отсутствия активных
build-процессов удалён только восстанавливаемый Docker build cache (2.013 GB):
свободно 59 GiB, build cache 34.3 MB. Docker images занимают 52.84 GB суммарно
по машине (до задачи 50.61 GB); новый web image — 1.45 GB. Старые образы,
контейнеры, volumes, базы и пользовательские файлы не удалялись.

## Доступ и ограничения

Публикация использовала отдельно сохранённый Keychain publisher credential.
Установка и Docker build использовали существующий токен только с read:packages.
Секрет передавался через память/окружение дочернего процесса и BuildKit secret,
не через argv, tracked files или логи. В runtime environment package credential
отсутствует. Подробнее: [private-packages.md](./private-packages.md).

Остаётся прежнее неблокирующее Next NFT warning по video-processor.
`npm audit` сообщает 9 уязвимостей в прежних зависимостях: 4 moderate, 4 high,
1 critical (Next.js 16.2.12). Это не исправлено данной UI-поставкой; обновление
framework и повторные проверки требуют отдельного среза. UI QA не является
аудитом безопасности.

Полные registry consumer build/QA Content Hub и Reverie Site этой поставкой
не подтверждены; их статусы нельзя выводить из здорового Image Production web.
