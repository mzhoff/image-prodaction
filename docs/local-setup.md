# Local setup: полный backend-контур

## Что запускается

Локальная среда состоит из четырёх частей:

1. PostgreSQL хранит пользователей, сессии, workspace, документы, metadata файлов
   и журнал AI-задач с usage.
2. MinIO имитирует production S3 и хранит оригиналы Library-изображений и их
   WebP-миниатюры в закрытом bucket.
3. Mailpit принимает тестовые письма по SMTP и показывает их в локальном браузере.
4. Next.js обслуживает интерфейс и backend API на `http://localhost:3004`.

Файлы не публикуются напрямую из MinIO: приложение сначала проверяет сессию и membership пользователя.

## Требования

- Node.js `>=20.9.0` (проект проверен на Node `24.15.0`);
- npm `>=10`;
- Docker Desktop;
- OpenRouter API key — только для реальных AI-вызовов, регистрация и документы работают без него.

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

Скопировать результат второй команды в `BETTER_AUTH_SECRET`. Для local-контура остальные backend-значения из `.env.example` уже указывают на Docker Compose.

Существующие provider keys (`OPENROUTER_API_KEY`, `FAL_API_KEY`, `TELEGRAM_BOT_TOKEN`) хранить только в `.env.local`. Этот файл не коммитится.

Поднять PostgreSQL, private MinIO и Mailpit:

```bash
docker compose up -d
docker compose ps
```

У PostgreSQL и Mailpit должен появиться статус `healthy`, а `minio-init` должен
один раз завершиться с кодом `0`. Это нормальное поведение: init-контейнер
только создаёт private bucket и после этого выключается.

Создать или обновить таблицы:

```bash
npm run db:migrate
```

Команда повторяемая: второй запуск не создаёт таблицы заново и не удаляет данные.

Запустить приложение:

```bash
npm run dev:local
```

Открыть:

- приложение: [http://localhost:3004](http://localhost:3004);
- MinIO console: [http://localhost:9001](http://localhost:9001);
- Mailpit inbox: [http://localhost:8025](http://localhost:8025);
- liveness: [http://localhost:3004/api/health/live](http://localhost:3004/api/health/live);
- readiness PostgreSQL и private S3: [http://localhost:3004/api/health/ready](http://localhost:3004/api/health/ready).

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
4. Создать новый документ и загрузить изображение через `Upload`.
5. Дождаться автосохранения и перезагрузить страницу: документ должен
   восстановиться из PostgreSQL, а изображение — из private MinIO.
6. Открыть `/library`: загруженный файл должен появиться в `Загруженные`.
   Результат технической обработки появляется здесь только после явного
   `Save to Library`; обычный `Download` ничего не сохраняет.
7. Выйти через `Sign out`: защищённая страница должна вернуть на `/login`.
8. Снова войти и проверить, что workspace и документ сохранились.
9. Нажать «Забыли пароль?», получить reset-письмо в Mailpit, сменить пароль и
   убедиться, что старый пароль больше не работает.

Полный backend smoke-test выполняет тот же путь автоматически и дополнительно
проверяет revision conflict, приватность asset между двумя пользователями,
Library-фильтры и пагинацию, запрет технической загрузки без `uploaded/saved`,
S3 upload/read/delete и сохранение Library-файлов после удаления документа:

```bash
npm run test:backend-smoke
```

Команда ожидает уже запущенное приложение на `http://localhost:3004`. Другой адрес можно передать через `SMOKE_BASE_URL`.
Если обязательное подтверждение включено, smoke получает письмо через
`MAILPIT_HTTP_URL`, подтверждает обоих тестовых пользователей и только после
этого проверяет API. Строгий CI-режим включается через
`SMOKE_REQUIRE_EMAIL_VERIFICATION=true`.

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
npm run typecheck
npm test
npm run test:backend-smoke
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
- PostgreSQL и S3 должны иметь backup/versioning lifecycle;
- секреты передаются через secret manager платформы, а не через Git.
