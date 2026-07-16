# Local setup: полный backend-контур

## Что запускается

Локальная среда состоит из трёх частей:

1. PostgreSQL хранит пользователей, сессии, workspace, документы и metadata файлов.
2. MinIO имитирует production S3 и хранит сами изображения в закрытом bucket.
3. Next.js обслуживает интерфейс и backend API на `http://localhost:3004`.

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

Поднять PostgreSQL и private MinIO:

```bash
docker compose up -d
docker compose ps
```

У PostgreSQL должен появиться статус `healthy`, а `minio-init` должен один раз завершиться с кодом `0`. Это нормальное поведение: init-контейнер только создаёт private bucket и после этого выключается.

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
- liveness: [http://localhost:3004/api/health/live](http://localhost:3004/api/health/live);
- readiness БД: [http://localhost:3004/api/health/ready](http://localhost:3004/api/health/ready).

Local MinIO credentials: `minioadmin` / `minioadmin`. Они предназначены только для локальной машины.

## Пользовательский smoke-test

1. Открыть `/register` и создать аккаунт.
2. Убедиться, что открывается personal workspace.
3. Создать новый документ.
4. Изменить canvas и дождаться статуса успешного сохранения.
5. Перезагрузить страницу: документ должен восстановиться из PostgreSQL.
6. Выйти через `Sign out`: защищённая страница должна вернуть на `/login`.
7. Снова войти и проверить, что workspace и документ сохранились.

## Проверки перед push

```bash
npm run db:check
npm run typecheck
npm test
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
