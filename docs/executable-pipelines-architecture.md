# Executable Pipelines architecture

Дата фиксации: 2026-07-17

Горизонт: после публичного релиза основного продукта, ориентировочно V2/V3
Статус: продуктовая и архитектурная гипотеза, не входит в ближайший implementation scope

## 1. Продуктовая цель

Executable Pipeline превращает опубликованный участок node graph в версионируемый
серверный процесс, который можно запускать:

- из Reverie;
- через внешний API;
- из Telegram-бота;
- из мобильного приложения;
- из CMS, Kanban, CRM или другого сервиса;
- по webhook или расписанию в будущих версиях.

Pipeline принимает типизированные входы, выполняет последовательность или DAG задач,
учитывает usage и возвращает типизированный результат.

## 2. Раздел Pipelines в интерфейсе

Вкладка `Pipelines` в Workspace является каталогом опубликованных Executable Pipelines.
Черновые участки canvas в каталог не попадают, пока пользователь явно не опубликует
их как executable.

### 2.1 Представления каталога

Поддерживаются:

- карточки;
- компактный список;
- поиск;
- фильтр по статусу;
- фильтр по origin document;
- фильтр по owner/author;
- сортировка по обновлению, запуску, success rate и расходам.

Карточка показывает:

- название и thumbnail canvas;
- active/paused/deprecated;
- опубликованную версию;
- origin document;
- количество нод;
- дату и результат последнего запуска;
- success rate;
- вызовы и provider cost за выбранный период.

### 2.2 Экран Pipeline details

При открытии pipeline пользователь не обязан сразу переходить в полный canvas.

Экран содержит вкладки:

1. `Overview`
   - описание;
   - входы и выходы;
   - текущая версия;
   - статус;
   - краткая статистика.
2. `Structure`
   - read-only превью canvas;
   - список нод и операций;
   - зависимости и порядок исполнения;
   - кнопка `Open in editor`.
3. `Endpoint`
   - стабильный URL;
   - auth policy;
   - rate/concurrency limits;
   - idempotency policy;
   - пример запроса и результата.
4. `Webhooks`
   - callback URLs;
   - подписанные события;
   - retry policy;
   - история доставок.
5. `Runs`
   - журнал запусков;
   - статус, инициатор, приложение и источник;
   - продолжительность;
   - входы/выходы в безопасном представлении;
   - ошибки и повторные попытки.
6. `Usage`
   - calls/success/failure;
   - input/output/total tokens;
   - provider cost;
   - агрегация по дням, месяцам, моделям и операциям;
   - фильтр периода.
7. `Versions`
   - история публикаций;
   - diff контрактов и графа;
   - rollback путем повторной активации старой immutable version.
8. `Storage`
   - политика хранения run artifacts;
   - сохранять ли финальные результаты в Library;
   - retention временных результатов.

## 3. Жизненный цикл

```text
draft
  -> validating
  -> published
  -> active
  -> paused
  -> deprecated
```

Опубликованная версия immutable. Редактирование origin document не меняет активный
endpoint молча.

Новая версия проходит:

1. graph validation;
2. input/output contract validation;
3. provider and credential dependency validation;
4. server executor availability check;
5. cost range estimation;
6. test run;
7. explicit publish.

Endpoint по умолчанию привязан к конкретной опубликованной версии. Переключение
версии является отдельной операцией с audit event.

## 4. Основные сущности

```text
executable_pipeline
  workspace_id
  origin_document_id
  name
  description
  status

pipeline_version
  pipeline_id
  version
  graph_snapshot
  input_schema
  output_schema
  checksum
  published_by_user_id
  published_at

pipeline_endpoint
  pipeline_id
  active_version_id
  public_id
  slug
  auth_policy
  rate_limit_policy
  concurrency_policy
  enabled

pipeline_run
  pipeline_id
  pipeline_version_id
  workspace_id
  initiator_type
  initiator_id
  source_application
  idempotency_key
  status
  input_reference
  output_reference
  started_at
  finished_at

node_run
  pipeline_run_id
  node_id
  node_type
  status
  attempt
  input_hash
  output_reference
  error

run_event
  pipeline_run_id
  event_type
  payload
  created_at
```

Usage events связываются с pipeline run и node run, но остаются частью общего usage
домена.

## 5. Публикация графа

Перед публикацией graph compiler:

- выделяет объявленные input/output nodes;
- проверяет типы портов;
- отклоняет неявные циклы;
- строит topological execution plan;
- определяет параллельные шаги;
- фиксирует node handler versions;
- фиксирует provider model IDs;
- проверяет наличие server executors;
- формирует JSON Schema входа и результата;
- оценивает ожидаемый диапазон provider cost.

Loop, iterator и batch разрешаются только как явные runtime-конструкции с лимитами.

## 6. Runtime API

Для всех pipelines используется единый route family:

```text
POST /v1/pipelines/{publicId}/runs
GET  /v1/runs/{runId}
POST /v1/runs/{runId}/cancel
GET  /v1/runs/{runId}/artifacts
```

Pipeline получает собственный стабильный URL через `publicId` или настраиваемый slug,
но сервер не создает новый route-файл для каждого pipeline.

Долгая операция возвращает:

```json
{
  "runId": "run_...",
  "status": "queued",
  "statusUrl": "/v1/runs/run_..."
}
```

Клиент получает результат через:

- polling;
- webhook;
- SSE в будущем;
- короткий synchronous wait только как дополнительный режим с ограниченным timeout.

## 7. Endpoint policies

Настройки endpoint включают:

- enabled/paused;
- API key, service account или будущий OAuth;
- hashed credentials внешнего клиента;
- allowed input size and modality;
- rate limit;
- concurrency limit;
- idempotency window;
- maximum estimated cost per run;
- callback allowlist;
- result retention;
- allowed source applications;
- CORS policy для browser consumers.

Публичный pipeline не обязан быть анонимным. `Published` означает доступность через
runtime endpoint, а auth policy задается отдельно.

## 8. Webhooks

Поддерживаемые события:

- `pipeline.run.queued`;
- `pipeline.run.started`;
- `pipeline.run.succeeded`;
- `pipeline.run.failed`;
- `pipeline.run.canceled`;
- `pipeline.run.reconciliation_required`.

Webhook содержит event ID, run ID, timestamp и ограниченный payload. Тело подписывается
workspace webhook secret. Доставка имеет собственный retry ledger и не меняет статус
успешно завершенного pipeline run.

## 9. Usage, logs и аналитика

Для каждого run фиксируются:

- источник запуска;
- пользователь, service account или API client;
- pipeline/version;
- node runs;
- retries;
- provider operation IDs;
- token usage;
- provider cost;
- продолжительность;
- output artifacts;
- error taxonomy.

Dashboard строится из агрегированных usage/run events, а не из логов приложения.
Логи служат диагностике и имеют ограниченный retention.

UI позволяет фильтровать:

- период;
- pipeline version;
- source application;
- status;
- model;
- operation;
- initiator.

## 10. Результаты Pipeline и Library

Промежуточные node outputs не добавляются в Library автоматически.

Pipeline имеет отдельную storage policy:

```text
ephemeral
  результат доступен ограниченное время для скачивания или callback

run_history
  результат хранится как run artifact, но не виден в Library

save_to_library
  финальный результат сохраняется как постоянный Library asset
```

Рекомендуемое значение по умолчанию — `ephemeral` или ограниченный `run_history`.
`save_to_library` пользователь включает явно в настройках pipeline.

Для фильтрации Library вводится отдельный creation source:

```text
creationSource = pipeline_run
pipelineId
pipelineVersionId
pipelineRunId
```

В UI это самостоятельная категория `Из пайплайнов`, а также фильтр по конкретному
pipeline.

Это лучше, чем считать любой pipeline result обычным `generated`: pipeline может
заканчиваться crop, composition, conversion, text, audio или другой операцией.

## 11. Frontend/backend processing parity

Executable Pipeline не имеет браузера, поэтому crop, resize, curves, adjustments,
composition, masks и conversion должны иметь server executors.

При этом не следует независимо реализовывать две разные математики операции.

Целевая модель:

- общий operation contract;
- общие pure calculation functions;
- frontend preview adapter;
- backend render adapter;
- единые fixtures и golden tests.

Тестовые уровни:

1. Exact equality
   - одинаковый byte/hash для операций, использующих один и тот же runtime engine.
2. Pixel parity
   - сравнение пикселей с допустимым минимальным tolerance.
3. Perceptual parity
   - SSIM/perceptual diff для операций, где browser и server различаются по
     resampling, fonts или color management.
4. Contract parity
   - одинаковые dimensions, alpha, format, metadata и semantic output.
5. Idempotency
   - повторная доставка одной команды не создает второй run result, Library asset
     или повторное списание.

Идентичность frontend/backend результата называется parity/determinism. Idempotency —
отдельное свойство повторного выполнения команды.

Composition и text rendering требуют фиксированных font files, color profile и
render-engine version. Иначе pixel-perfect parity между Chromium и Node гарантировать
нельзя.

## 12. Telegram и другие adapters

Telegram bot не реализует pipeline engine.

Adapter:

1. принимает Telegram update;
2. связывает chat/user с service account;
3. преобразует сообщение в pipeline input;
4. вызывает общий runtime API;
5. получает webhook или проверяет status;
6. отправляет artifact пользователю.

Тот же принцип применяется к CMS, Kanban, mobile app и другим внешним сервисам.

## 13. Не входит в первую версию Executable Pipelines

- arbitrary JavaScript/code nodes;
- бесконечные циклы;
- пользовательские Docker containers;
- multi-region execution;
- marketplace публичных pipelines;
- сложный визуальный debugger;
- automatic provider optimization;
- полная event-streaming платформа.

Первая версия должна доказать versioned publish, надежный run, понятный endpoint,
usage accounting и воспроизводимый результат.
