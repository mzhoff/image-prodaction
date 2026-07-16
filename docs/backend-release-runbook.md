# Backend release runbook

## Release order

1. Создать backup PostgreSQL и проверить доступность S3 bucket.
2. Собрать один immutable Docker image из конкретного commit SHA.
3. Выполнить `npm run db:migrate` отдельной release-задачей.
4. Запустить новую версию приложения без переключения всего трафика.
5. Проверить `/api/health/live` и `/api/health/ready`.
6. Выполнить auth/workspace/document/asset smoke-test.
7. Переключить трафик и наблюдать 401/403/409/5xx, latency БД и ошибки S3.

Миграция и приложение разделены специально: если таблицы не создались, новая версия не должна принимать пользовательский трафик.

## Required runtime configuration

- `DATABASE_URL`;
- `BETTER_AUTH_URL`;
- `BETTER_AUTH_SECRET`;
- `BETTER_AUTH_TRUSTED_ORIGINS`;
- `S3_REGION`;
- `S3_BUCKET`;
- S3 credentials через workload identity либо secret manager;
- provider keys для включённых AI-интеграций.

`NEXT_PUBLIC_BETTER_AUTH_URL` является публичной настройкой. Database, auth secret, S3 secret и provider keys публичными не являются.

## Rollback

- приложение можно откатить на предыдущий immutable image;
- уже применённую migration нельзя удалять или редактировать;
- несовместимое изменение схемы исправляется новой forward migration;
- destructive schema changes выполняются только через expand/migrate/contract в нескольких релизах;
- при потере данных восстановить PostgreSQL из backup, а asset metadata сверить с versioned S3 bucket.

## Security gates

- HTTPS на внешнем ingress;
- private S3 bucket без anonymous policy;
- уникальный Better Auth secret минимум 32 байта;
- trusted origins только известных frontend origins;
- database user без прав владельца кластера;
- rate limit для auth endpoints;
- логи не содержат пароли, cookies, database URL и S3 credentials;
- регулярная ротация секретов и проверка `npm audit`.
