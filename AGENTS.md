# Project agent instructions

## Product platform direction

- Before changing Workspace, Identity, membership, provider ownership,
  executable pipelines, service authentication, usage, shared assets,
  ChatModule integration, subscriptions, or cross-product APIs, read
  [docs/platform-integration-direction.md](docs/platform-integration-direction.md).
- The document is an approved strategic direction, not an instruction to build
  the whole platform during a local product task.
- Keep Image Production focused on visual production, graph authoring, immutable
  pipeline publication, and durable execution. Do not turn it into the central
  CMS, Identity Service, Knowledge Base, or Billing Service.
- Preserve existing Workspace IDs and ownership until an explicit migration to
  the canonical Platform Control Plane is designed and approved.
- External consumers bind semantic capability keys to pinned pipeline versions;
  they must not depend on canvas node IDs or mutable draft graphs.
- Resolve identity, Workspace membership, permissions, and entitlements on the
  server. Browser context is a selector only.
- Keep long-running and paid operations idempotent, durable, recoverable,
  cost-bounded, and auditable.
- Keep shared code behind contracts/core/adapters. Update ChatModule as one
  exact-version package family and run consumer checks; do not create a hidden
  local fork.
- Emit normalized usage; do not hard-code pricing or subscription behavior
  before platform unit economics are approved.
- Do not extract a microservice or add a broker/Kubernetes dependency without a
  measured scaling, security, release, or availability trigger.
- If a change alters an ecosystem boundary, update the product direction
  document or add a focused ADR before implementation.

## Сохранение локальной интеграции с Content Hub

- Перед пересозданием локального `web` проверяй его Docker networks и наличие
  работающего `ludimogut-api` в сети `prodaction-services-local`.
- Если локальная интеграция используется, включай `compose.integration.yaml`
  вместе с `compose.yaml` во **все** команды `compose up`, которые пересоздают
  `web`. Сохраняй остальные необходимые overlays и защищённые runtime-настройки.
  Один `compose.yaml` удаляет сетевое подключение и alias `image-production-api`
  при пересоздании контейнера, хотя сам Image Production остаётся healthy.
- После перезапуска проверяй из контейнера Content Hub доступность
  `http://image-production-api:3000` и живую проверку Runtime v2 connection
  без запуска генерации. Host healthcheck на `localhost:3004` не подтверждает
  работоспособность межпродуктовой сети.
- Уже работающий контейнер можно вернуть в существующую сеть без остановки:
  `docker network connect --alias image-production-api prodaction-services-local image-prodaction-web-1`.
  Сначала проверь точный контейнер, его Compose project и отсутствие подключения.
  Это аварийное восстановление, а не замена Compose overlay при следующем `up`.
- Не меняй ради такого восстановления tokens, Workspace, grants и bindings;
  не пересоздавай базы, volumes или пользовательские pipelines.

## Node behavior and assistant knowledge invariant

Any change to a node's behavior, ports, settings, execution support, limits, or
user-visible dataflow must update the node's product explanation in the same
change. A node change is incomplete while Studio, Ask AI, MCP/agent tools,
documentation, and tests describe different contracts.

Review and update all applicable sources of truth:

- live type, settings, and static ports: `src/entities/production-graph/model/types.ts`,
  `node-registry*.ts`, and `node-definitions.ts`;
- Ask AI and live `node_catalog` metadata:
  `src/entities/production-graph/model/node-help-*.ts`;
- agent/MCP settings and action contract:
  `src/modules/chat-assistant/contracts/image-production-tools.ts`,
  `pipeline-node-tool-schema.ts`, and the relevant instructions in
  `src/modules/chat-assistant/core/system-prompt.ts`;
- executable runtime truth when server behavior changes:
  `src/modules/executable-pipelines/adapters/studio/studio-runtime-descriptor.ts`,
  `studio-pipeline-compiler.ts`, `studio-explicit-pipeline-compiler.ts`, and
  `src/modules/executable-pipelines/server/pipeline-*-handlers.ts`;
- concise user/QA index: `docs/assistant-knowledge/node-catalog.md`, plus the
  relevant product or executable-pipeline documentation;
- tests for the changed surface, including `node-help.test.ts`,
  `node-catalog.test.ts`, tool-schema/action tests, port/connection tests, and
  executable compiler/handler tests when runtime behavior changes.

`NODE_DEFINITIONS` and the runtime descriptor/handler remain authoritative for
what the product can execute. `NODE_HELP_METADATA` is authoritative for what
Ask AI explains. Markdown is a user-facing and QA projection, not a substitute
for either live contract. At minimum run the focused tests for every touched
surface, then `npm run typecheck`, `npm run lint`, and
`npm run check:architecture`. Do not document a port or setting as available
until its live contract and tests exist.

<!-- portfolio-context:start -->
## Портфельный контекст продукта

- Продукт: **Image Production — визуальный AI-конвейер**.
- Карточка продукта: [Notion](https://app.notion.com/p/3b875415801481bd9672e1115d5d5811).
- Бэклог портфеля: [Продуктовые инициативы](https://app.notion.com/p/f45fe97f627b4c9a9f6ede57e9a9f9c5).
- Рыночный контекст: [Рыночный радар](https://app.notion.com/p/3c6754158014817a8281e8fe44b5631a).

Notion — источник истины по приоритету, стратегическому статусу, стадии,
текущему состоянию, следующему рубежу, гипотезам и продуктовым решениям.
Репозиторий, код, тесты и runtime-проверки — источник истины по фактическому
техническому состоянию.

Перед планированием roadmap, нового функционала, существенного изменения
scope или архитектуры, запуском, паузой либо возобновлением продукта используй
`$portfolio-context` и загружай живую карточку продукта из Notion. Если навык
недоступен, выполни те же шаги напрямую через подключённый Notion. Не считай
значения, запомненные из прошлой задачи или записанные в репозитории, текущими.

В начале такой задачи кратко зафиксируй: приоритет, стратегический статус,
стадию, текущее состояние, следующий рубеж, последнее релевантное принятое
решение и соответствие запроса этому контексту. Для discovery, roadmap,
позиционирования, запуска и значимого изменения архитектуры дополнительно
прочитай связанные рыночные сигналы и тезисы. Сигнал — повод проверить
гипотезу, а не доказательство спроса.

- Если работа прямо продвигает следующий рубеж — укажи это в плане.
- Если работа нейтральна — не расширяй scope без необходимости.
- Если работа конфликтует с паузой, наблюдением или принятым решением — покажи
  конфликт и его последствия до реализации.
- Если Notion недоступен, не угадывай продуктовый контекст. Механическую задачу
  можно продолжить по фактам репозитория; продуктовое решение нужно остановить.

Не меняй в Notion приоритет, стратегический статус или продуктовые решения
автоматически. После проверенного изменения, которое действительно меняет
состояние продукта или следующий рубеж, предложи точечное обновление со ссылкой
на техническое доказательство. Вноси его только после явного разрешения
пользователя на конкретную запись, затем повторно прочитай страницу и проверь
результат.
<!-- portfolio-context:end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
