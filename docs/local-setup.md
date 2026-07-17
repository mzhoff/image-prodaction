# Local setup: полный backend-контур

## Что запускается

Локальная среда состоит из пяти частей:

1. PostgreSQL хранит пользователей, сессии, workspace, документы, metadata файлов
   и журнал AI-задач с usage.
2. MinIO имитирует production S3 и хранит оригиналы Library-изображений и их
   WebP-миниатюры в закрытом bucket.
3. Mailpit принимает тестовые письма по SMTP и показывает их в локальном браузере.
4. Next.js обслуживает интерфейс и backend API на `http://localhost:3004`.
5. Generation worker независимо от браузера забирает задачи из PostgreSQL,
   вызывает AI provider, сохраняет результат в MinIO и публикует его в Library.

Файлы не публикуются напрямую из MinIO: приложение сначала проверяет сессию и membership пользователя.

## Требования

- Node.js `>=20.9.0` (проект проверен на Node `24.15.0`);
- npm `>=10`;
- Docker Desktop;
- OpenRouter API key — только для реальных AI-вызовов; он вводится в настройках
  Workspace, а не в `.env.local`.

## Первый запуск

Установить зависимости:

```bash
npm ci
```

Создать локальные настройки:

```bash
cp .env.example .env.local
openssl rand -base64 32
```

Команду `openssl rand -base64 32` выполнить три раза и записать независимые
значения в:

- `BETTER_AUTH_SECRET`;
- `PROVIDER_CREDENTIALS_MASTER_KEY`;
- `PROVIDER_CREDENTIALS_FINGERPRINT_KEY`.

Первый секрет защищает сессии. Второй шифрует Workspace provider keys в базе.
Третий создаёт необратимый fingerprint для сравнения ключей. Эти значения нельзя
переиспользовать между собой или коммитить.

`FAL_API_KEY` и `TELEGRAM_BOT_TOKEN`, пока они нужны соответствующим интеграциям,
хранятся только в `.env.local`.

Compose сам передаёт Mailpit тестовую пару `reverie-local` /
`reverie-local-mailpit`. Это не пароль от почты: локальный Mailpit принимает
любые credentials, а значения нужны, чтобы production-mode контейнер проходил
строгую проверку SMTP-конфигурации.

Поднять весь контейнерный контур, включая web, migrations и worker:

```bash
docker compose up --build -d
docker compose ps
```

У PostgreSQL, Mailpit, web и worker должен появиться статус `healthy`, а
`minio-init` и `migrate` должны один раз завершиться с кодом `0`. Это нормальное
поведение: первый создаёт private bucket, второй применяет миграции.

Для разработки с hot reload вместо контейнерных web/worker можно поднять только
зависимости:

```bash
docker compose up -d postgres minio minio-init mailpit
npm run db:migrate
npm run dev:local
```

И в отдельном терминале:

```bash
npm run worker
```

Команда миграций повторяемая: второй запуск не создаёт таблицы заново и не
удаляет данные.

Открыть:

- приложение: [http://localhost:3004](http://localhost:3004);
- MinIO console: [http://localhost:9001](http://localhost:9001);
- Mailpit inbox: [http://localhost:8025](http://localhost:8025);
- liveness: [http://localhost:3004/api/health/live](http://localhost:3004/api/health/live);
- readiness PostgreSQL и private S3: [http://localhost:3004/api/health/ready](http://localhost:3004/api/health/ready).
- generation worker и глубина очереди: [http://localhost:3004/api/health/worker](http://localhost:3004/api/health/worker).

Local MinIO credentials: `minioadmin` / `minioadmin`. Они предназначены только для локальной машины.
Mailpit не требует логина: он доступен только как локальная тестовая инфраструктура.

`AUTH_REQUIRE_EMAIL_VERIFICATION=true` запрещает вход до перехода по ссылке из
письма. Это безопасная политика по умолчанию. Для аварийной локальной проверки
её можно явно отключить значением `false`; в CI флаг всегда принудительно
возвращается в `true`.

## Пользовательский smoke-test

1. Открыть `/register` и создать аккаунт.
2. Открыть Mailpit, найти письмо «Подтвердите email в Reverie» и перейти по ссылке.
3. Убедиться, что открывается personal workspace.
4. Открыть `Settings → Workspace → AI Providers`, подключить OpenRouter key и
   убедиться, что интерфейс показывает только маску ключа.
5. Создать новый документ и загрузить изображение через `Upload`.
6. Дождаться автосохранения и перезагрузить страницу: документ должен
   восстановиться из PostgreSQL, а изображение — из private MinIO.
7. Запустить Generate, обновить страницу до завершения и убедиться, что нода
   продолжила ждать ту же серверную задачу, а результат появился в Library.
8. Открыть `/library`: загруженный файл должен появиться в `Загруженные`.
   Результат технической обработки появляется здесь только после явного
   `Save to Library`; обычный `Download` ничего не сохраняет.
9. Выйти через `Sign out`: защищённая страница должна вернуть на `/login`.
10. Снова войти и проверить, что workspace и документ сохранились.
11. Нажать «Забыли пароль?», получить reset-письмо в Mailpit, сменить пароль и
   убедиться, что старый пароль больше не работает.

Полный backend smoke-test выполняет тот же путь автоматически и дополнительно
проверяет revision conflict, приватность asset между двумя пользователями,
Library-фильтры и пагинацию, запрет технической загрузки без `uploaded/saved`,
S3 upload/read/delete и сохранение Library-файлов после удаления документа.
В CI тот же smoke дополнительно подключает контролируемый fake OpenRouter,
отправляет запрос через публичный API, дожидается отдельного worker и проверяет
generated asset, его S3-содержимое и агрегированный usage:

```bash
npm run test:backend-smoke
```

Команда ожидает уже запущенное приложение на `http://localhost:3004`. Другой адрес можно передать через `SMOKE_BASE_URL`.
Если обязательное подтверждение включено, smoke получает письмо через
`MAILPIT_HTTP_URL`, подтверждает обоих тестовых пользователей и только после
этого проверяет API. Строгий CI-режим включается через
`SMOKE_REQUIRE_EMAIL_VERIFICATION=true`. Fake provider разрешён кодом только при
`CI=true` или `NODE_ENV=test`; в обычной локальной и production-среде
`AI_PROVIDER_RUNTIME=fake` приводит к немедленной ошибке конфигурации.

Отдельный generation persistence smoke работает напрямую с локальными PostgreSQL
и MinIO. Он проверяет, что готовый asset становится видимым вместе с успешным job,
cancel не пропускает поздний результат, неизвестный исход provider call не
ретраится вслепую, а поздний полный usage не удваивает статистику:

```bash
npm run test:generation-persistence-smoke
```

Тест создаёт временный Workspace и удаляет его и тестовые S3-объекты после
завершения.

Полный браузерный critical-path:

```bash
npm run test:e2e:install
npm run test:e2e
```

Playwright также ожидает уже запущенное приложение. Другой адрес передаётся
через `E2E_BASE_URL`, Mailpit — через `MAILPIT_HTTP_URL`. Для каждого запуска
создаются уникальные адреса `@example.test`, поэтому тест не зависит от
состояния предыдущего запуска.

## Проверки перед push

```bash
npm run db:check
npm run check:architecture
npm run typecheck
npm test
npm run test:backend-smoke
npm run test:generation-persistence-smoke
npm run test:e2e
npm run build
npm audit --omit=dev --audit-level=high
```

## Остановка и данные

Остановить сервисы, сохранив данные:

```bash
docker compose stop
```

Снова запустить:

```bash
docker compose start
```

`docker compose down` удаляет контейнеры, но сохраняет named volumes. Команда `docker compose down -v` удалит локальную БД и все MinIO-файлы; использовать её только для осознанного полного сброса.

## Production-заметки

- не использовать local passwords и `BETTER_AUTH_SECRET` из примера;
- запускать миграции отдельным release step до переключения трафика;
- bucket должен оставаться private;
- readiness должен быть подключён к health probe платформы;
- web и generation worker должны иметь отдельные health probes;
- PostgreSQL и S3 должны иметь backup/versioning lifecycle;
- provider master key и fingerprint key должны храниться в secret manager и
  ротироваться по версии, не теряя предыдущий ключ расшифрования;
- секреты передаются через secret manager платформы, а не через Git.
