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
