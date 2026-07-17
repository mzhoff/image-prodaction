# Workspace AI execution implementation plan

Дата: 2026-07-17

Статус: реализовано в `feat/workspace-ai-execution`, интеграционная проверка
Архитектура: [workspace-ai-execution-architecture.md](./workspace-ai-execution-architecture.md)

## 1. Результат этапа

После завершения:

1. Owner/Admin подключает OpenRouter key в настройках Workspace.
2. Key валидируется и хранится в зашифрованном виде.
3. Все AI-операции Workspace используют только его connection.
4. Долгие операции выполняет отдельный worker.
5. Frontend получает job ID, показывает состояние и восстанавливается после reload.
6. Retry не создает повторный asset или двойную локальную usage-запись.
7. Workspace видит OpenRouter key limits и локальную AI-статистику.
8. Два Workspace не могут использовать или увидеть credentials/usage друг друга.

## 2. Ограничения

В scope не входят:

- credit wallet;
- тарифы и payment provider;
- dynamic feature flags;
- приглашение участников;
- platform-funded generation;
- Executable Pipelines;
- production multi-host deployment;
- Redis и отдельный queue cluster.

## 3. Этап 0. Архитектурные границы

### Работы

- ввести `modules/provider-connections`;
- ввести `modules/generation`;
- ввести `modules/usage`;
- ввести platform contracts для crypto и queue;
- добавить public entrypoints модулей;
- зафиксировать запрет прямого OpenRouter dependency внутри generation core;
- добавить CI-проверку архитектурных импортов.

### Результат

Новая функциональность не увеличивает текущий FSD drift. Frontend FSD остается для UI,
а backend-домены развиваются как modular monolith.

### Проверки

- architecture import check;
- typecheck;
- существующие unit tests;
- production build.

## 4. Этап 1. Provider contract

### Работы

- описать normalized provider request/result;
- описать modality contracts;
- описать provider usage;
- определить error taxonomy;
- определить retry/reconciliation classification;
- реализовать OpenRouter adapter;
- реализовать fake provider adapter;
- удалить чтение глобального key из provider core;
- сохранить временную совместимость текущих route handlers до переключения.

### Тесты

- нормализация text/image/audio response;
- полный и неполный usage;
- invalid credential;
- 401/402/403/408/429/5xx classification;
- timeout before/after provider operation ID;
- response без ожидаемой modality;
- adapter contract tests для fake и OpenRouter fixtures.

## 5. Этап 2. Workspace provider credentials

### Миграции

- `workspace_provider_connection`;
- `workspace_provider_credential`;
- индексы и unique active OpenRouter connection per Workspace;
- audit-safe metadata;
- encryption key version.

### Backend

- AES-256-GCM crypto adapter;
- validate-before-activate;
- replace/rotate;
- disconnect/revoke;
- get masked connection status;
- refresh key summary;
- Workspace isolation;
- Owner/Admin authorization.

### API

```text
GET    /api/workspaces/{workspaceId}/providers
POST   /api/workspaces/{workspaceId}/providers/openrouter
POST   /api/workspaces/{workspaceId}/providers/openrouter/validate
DELETE /api/workspaces/{workspaceId}/providers/openrouter
GET    /api/workspaces/{workspaceId}/providers/openrouter/usage
```

Raw key принимается только create/replace endpoint и никогда не возвращается.

### Тесты

- ciphertext не содержит исходный key;
- master key отсутствует в DB;
- credential другого Workspace недоступен;
- Creator/Viewer не может изменить connection;
- failed validation не удаляет старый рабочий key;
- successful rotation переключает active version;
- audit/log payload не содержит secret;
- backup fixture не позволяет восстановить key без master key.

## 6. Этап 3. Workspace settings UI

### Работы

- расширить settings navigation разделом Workspace;
- добавить `AI Providers`;
- состояние connected/disconnected/invalid;
- connect/replace form;
- validate and disconnect actions;
- маскированный key label;
- limit/remaining/reset;
- daily/weekly/monthly/all-time usage;
- last sync/error;
- пояснение, что key действует для всего Workspace.

### UX-правила

- stored key никогда не подставляется обратно в input;
- replace требует явного подтверждения;
- disconnect предупреждает о queued jobs;
- не показывать «полный баланс аккаунта», если provider вернул только key limit;
- ошибки переводятся в понятные сообщения;
- управление скрыто для ролей без разрешения.

### Тесты

- keyboard/focus/accessibility;
- loading/error/empty states;
- route/modal close behavior;
- смена активного Workspace обновляет connection view;
- два тестовых Workspace показывают разные masked labels и usage.

## 7. Этап 4. Queue transport и worker

### Инфраструктура

- использовать `generation_job` как PostgreSQL-backed очередь без отдельного
  брокера на текущем однохостовом этапе;
- отдельный worker entrypoint;
- отдельный `worker` service в Docker Compose;
- web и worker собираются из одного image;
- worker liveness/readiness/heartbeat;
- graceful shutdown;
- queue depth и failed jobs в diagnostics.

### Transaction boundary

Payload хранится в S3, поэтому записать его и PostgreSQL job одной транзакцией
невозможно. Submission использует восстанавливаемую последовательность:

1. идемпотентно создаёт product job без `enqueued_at`;
2. сохраняет приватный request payload в S3;
3. атомарно добавляет `request_object_key` и `enqueued_at`.

Job без `enqueued_at` не выбирается worker-ом и безопасно продолжается повторным
submit с тем же idempotency key. Queue command без product job невозможен, потому что
отдельного queue transport на этом этапе нет.

### Worker handler

1. получает job ID;
2. атомарно начинает attempt;
3. проверяет Workspace/provider connection;
4. загружает и расшифровывает credential;
5. вызывает provider adapter;
6. сохраняет output;
7. фиксирует usage;
8. сохраняет provider checkpoint до изменения product state;
9. завершает job и публикует Library asset одной PostgreSQL transaction.

### Retry

- exponential backoff с jitter;
- max attempts;
- permanent/retryable/ambiguous taxonomy;
- lease recovery;
- reconciliation по provider operation ID;
- per-attempt S3 checkpoint результата;
- dispatch marker, запрещающий слепой повтор платного вызова после crash;
- dead/final failure state;
- ручной retry через административный API позже.

### Тесты

- worker restart во время queued job;
- crash после provider success до DB commit;
- duplicate delivery;
- expired lease;
- key rotation до старта job;
- disconnect во время queue wait;
- concurrent jobs одного Workspace;
- two-workspace isolation;
- graceful shutdown.

## 8. Этап 5. Асинхронная image generation

### Первая вертикаль

Асинхронно через worker переводится `generate image`.

`edit image` и `refine image` остаются короткими синхронными операциями: это
промежуточная обработка, результат которой не создаёт asset в S3/Library без
явной пользовательской команды. При этом сами provider calls создают job и
usage event.

### API

```text
POST /api/generation-jobs
GET  /api/generation-jobs/{jobId}
POST /api/generation-jobs/{jobId}/cancel
```

Frontend получает `202`, job ID и status URL.

### Frontend

- node сохраняет job ID;
- показывает queued/running/retrying;
- polling восстанавливается после reload;
- success подключает готовый asset;
- failure показывает error taxonomy;
- cancel является best effort;
- idempotency key переживает повторный submit.

### Совместимость

Старый синхронный route удаляется только после зеленого end-to-end сценария.

## 9. Этап 6. Все AI-операции и usage events

После image vertical через общий provider/execution path переводятся:

- image analysis;
- subject/location description;
- text generation;
- Telegram text formatting;
- speech generation;
- будущие provider-based nodes.

Для коротких операций worker может оставаться внутренней реализацией, даже если UI
ожидает ответ через короткий wait. Сейчас они создают durable job, checkpoint
оплаченного результата и usage event в синхронном request path. Повтор запроса с тем
же idempotency key возвращает checkpoint и не вызывает провайдера снова.

### Usage API

```text
GET /api/workspaces/{workspaceId}/ai-usage
  ?periodDays=30
```

Расширенные фильтры по датам, модели, операции и статусу оставлены следующим
инкрементом для полноценного billing dashboard.

### Тесты

- input/output/total tokens;
- provider cost exact decimal;
- несколько provider calls в одной product job;
- failed call с частичным usage;
- aggregation by model/operation/day;
- no cross-workspace aggregation;
- OpenRouter key summary и локальный ledger отображаются как разные источники.

## 10. Этап 7. Однохостовый тестовый контур

Docker services:

```text
reverse-proxy
web
worker
postgres
minio
mailpit
```

### Обязательные меры

- HTTPS;
- PostgreSQL и MinIO API/console не публикуются наружу;
- provider master key передается как runtime secret;
- immutable image;
- migrations отдельной release job;
- PostgreSQL backup + проверенный restore;
- MinIO backup/replication strategy;
- log rotation;
- web/worker health;
- queue diagnostics;
- invite-only registration или закрытый ingress;
- smoke-test с двумя Workspace и разными fake credentials.

## 11. Этап 8. Подписка и роли — отдельный следующий контур

После закрытого теста:

- роли `owner/admin/creator/viewer`;
- membership status;
- paid subscription/seat status;
- execution entitlement;
- viewer-like fallback для неоплаченного Creator;
- Owner/Admin governance без бесплатного AI execution;
- paywall и upgrade CTA;
- plan catalog и pricing versioning позже.

Этот этап не должен менять provider credential ownership: connection остается
ресурсом Workspace.

## 12. Параллельные рабочие потоки

После отдельного подтверждения реализацию можно разделить:

1. Provider/Credentials
   - contracts, OpenRouter adapter, encryption, DB/API.
2. Worker/Orchestration
   - queue, worker, retries, job API, observability.
3. Settings UI
   - Workspace settings, key lifecycle, usage presentation.
4. Quality/Integration
   - migrations, security tests, crash/retry tests, E2E and Docker contour.

Интеграция выполняется по контрактам. Shared files и migrations меняются
последовательно, чтобы подагенты не конфликтовали в одной рабочей папке.

## 13. Definition of Done

Функциональный этап завершен, если:

- два Workspace используют разные OpenRouter/fake credentials;
- ни один пользователь не видит raw key после сохранения;
- cross-workspace credential access запрещен;
- генерация продолжается после reload browser;
- queued job переживает restart worker;
- duplicate delivery не создает двойной asset или usage event;
- ambiguous timeout не повторяется слепо;
- все платные AI routes создают нормализованный usage event;
- settings показывают key summary и локальный usage;
- web/worker image проходит CI и smoke;
- CI проходит реальный путь API → PostgreSQL queue → отдельный worker →
  provider contract → private S3 → Library → usage aggregate на fake adapter,
  который программно запрещён вне CI/test;
- PostgreSQL/MinIO smoke проверяет атомарную публикацию, cancel fence,
  `provider_outcome_unknown` и superseding usage reconciliation;
- product code больше не читает глобальный OpenRouter key как основной runtime source.

Проверенный PostgreSQL/MinIO restore, HTTPS/reverse proxy и production backup
policy относятся к будущему staging/production контуру и не блокируют текущую
локальную разработку.
