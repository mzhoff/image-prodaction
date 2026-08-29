# ChatModule integration feedback backlog

Этот документ накапливает замечания, найденные при реальном использовании
ChatModule в Image Production. Мы не выпускаем новую версию внешнего пакета на
каждое наблюдение: сначала собираем подтверждённый пакет изменений, затем
передаём его команде ChatModule одним релизным циклом и повторяем consumer tests.

Временный код Image Production и условия его будущего удаления ведутся отдельно
в `docs/chatmodule-consumer-workarounds.md`. Upstream fix нельзя считать
завершённым, пока связанный workaround не заменён и не проверен в consumer.

## Как вести документ

- Каждое новое наблюдение получает постоянный ID и дату.
- Отдельно фиксируются evidence, влияние, временный consumer workaround и
  ожидаемое изменение внешнего пакета.
- В handoff остаются только открытые универсальные задачи ChatModule; product-specific
  решения и уже consumer-verified пункты из рабочего списка удаляются.
- Запись закрывается только после публикации пакета и повторной проверки в
  установленном consumer, а не после одного теста внутри ChatModule.

Рабочие статусы: `observed`, `workaround-active`, `ready-for-upstream`,
`upstream-fixed`. Закрытые после проверки установленного consumer получают
архивный статус `consumer-verified`.

## Архитектурное решение: quality и knowledge принадлежат ChatModule

Решение от 2026-08-11: Image Production не разрабатывает собственную панель
`Assistant Quality`, собственный редактор knowledge base или параллельную схему
оценок. Эти возможности должны поставляться ChatModule как включаемые коробочные
модули и использоваться всеми продуктами без форков.

Host-приложение отвечает только за композицию: подключает опубликованные пакеты,
передаёт server-side auth/tenant context, сопоставляет права, настраивает
поддерживаемый persistence/search/storage adapter, монтирует готовую панель и
явно запускает опубликованные миграции. ChatModule не должен импортировать код
Image Production, самостоятельно применять миграции или владеть продуктовыми
секретами.

## Передача в следующий релиз ChatModule

Этот handoff намеренно содержит только открытые универсальные задачи. Пункты,
которые уже поставлены ChatModule 0.11.0 или 0.12.0 и повторно проверены в
Image Production, удалены из рабочего списка; краткий результат 0.12.0 и
подробная история исходных проблем сохранены ниже. Product-specific поведение
Image Production сюда также не включается.

| ID | Приоритет | Область | Статус | Кратко |
| --- | --- | --- | --- | --- |
| CM-007 | P1 | Assistant Quality / evaluation / UI / SDK | `ready-for-upstream` | Нет коробочной панели анализа и улучшения ответов |
| CM-008 | P1 | Knowledge Base / UI / retrieval / persistence | `ready-for-upstream` | Нет управляемой и версионируемой базы знаний как модуля |
| CM-021 | P2 | Agent runtime / product-validation recovery | `ready-for-upstream` | Базовый recovery поставлен; нет публичного контракта для безопасной причины product preflight |
| CM-024 | P1 | Agent runtime / schema diagnostics | `ready-for-upstream` | После исчерпания recovery нет bounded diagnostics и понятной причины invalid tool input |
| CM-025 | P2 | Agent runtime / repeated read tools | `ready-for-upstream` | Повторные одинаковые read-tools расходуют step budget и раздувают контекст одного turn |
| CM-026 | P1 | Agent runtime / verified-context conflict recovery | `ready-for-upstream` | Revision drift внутри turn сворачивается в общий `CHAT_TOOL_PREPARATION_FAILED` вместо автоматической revalidation |
| CM-027 | P1 | Interactive responses / persisted selection | `ready-for-upstream` | Нет универсальной интерактивной карточки множественного выбора с продолжением того же turn |

## Поставлено и проверено в ChatModule 0.12.0

| ID | Область | Статус | Consumer-результат |
| --- | --- | --- | --- |
| CM-022 | Composer / keyboard policy | `consumer-verified` | Image Production использует `composerKeyboardPolicy="focused"`; локальный focus/global-keydown boundary CW-011 удалён. |
| CM-023 | Agent runtime / Retry context | `consumer-verified` | Retry переносит сохранённые selectors в host-owned resolver; локальный поиск selectors по conversation CW-015 удалён. |
| CM-028 | Runtime / live tool-call delivery | `consumer-verified` | Completed tool event приходит в основном turn SSE до terminal event; REST reconciliation CW-014 удалён. |

Подробные записи ниже сохраняют исходное воспроизведение, влияние и критерии
приёмки этих пунктов. Они являются архивом и не входят в следующий upstream
handoff.

### CM-007 — коробочный модуль Assistant Quality

- **Обнаружено:** 2026-08-11 при подготовке пилотного quality-review процесса.
- **Что уже есть:** conversations, messages, agent turns, tool outputs, модель,
  latency, tokens и cost сохраняются в PostgreSQL.
- **Чего не хватает:** готовой панели, evaluation domain, review API/SDK,
  persistence contracts и безопасного экспорта eval dataset.
- **Влияние:** вопросы и ответы можно восстановить технически, но нельзя вести
  воспроизводимый цикл «плохой ответ -> причина -> правка знания -> повторный
  тест -> подтверждение улучшения».
- **Владелец функции:** ChatModule. Image Production не создаёт собственную
  quality-панель и ждёт опубликованный пакет.

#### Обязательные возможности Assistant Quality

- Готовая встраиваемая React-панель и headless SDK/API для продуктов с другим
  интерфейсом. Панель включается product profile/feature flag и может работать
  как отдельный защищённый раздел или как встроенный экран host-приложения.
- Список запросов и ответов с поиском и фильтрами по product, tenant/workspace,
  периоду, модели, статусу разбора, оценке, категории проблемы и reviewer.
- Карточка конкретного turn: исходный вопрос, неизменяемый исходный ответ,
  system/prompt revision, модель, tool calls, источники, knowledge revision,
  latency, tokens, cost и безопасная диагностика ошибки.
- Human review: оценка, категории ошибки, теги, комментарий, исправленный
  эталонный ответ, reviewer/assignee, статус `unreviewed -> in-review ->
  accepted/needs-fix` и полная история изменений.
- Создание из проверенных кейсов versioned golden dataset и повторный запуск
  regression eval после смены модели, prompt или knowledge revision. Результаты
  разных прогонов сравниваются, исходный production-аудит не переписывается.
- Quality summary: доля проверенных и полезных ответов, категории ошибок,
  citation/tool coverage, latency и cost. Агрегаты не заменяют просмотр
  конкретных ответов.
- Sampling/queue: возможность отбирать все ответы, случайную долю, ответы с
  ошибками, высокой стоимостью, негативной оценкой или заданным тегом.
- Безопасный tenant-scoped export для offline eval с redaction; raw secrets,
  credentials, приватные provider payloads и лишние персональные данные в UI и
  экспорт не попадают.

#### Контракты, права и хранение Assistant Quality

- Framework-neutral evaluation contracts/store отделены от UI, Next/Nest
  adapters и конкретной ORM. Prisma и Drizzle consumers используют одинаковую
  модель через поддерживаемые persistence adapters.
- Все request/response/tool/LLM записи получают надёжные связи с конкретным
  turn и assistant message. Evaluation ссылается на них по стабильным ID.
- Минимальные permissions: `assistant.quality.read`,
  `assistant.quality.review`, `assistant.quality.manage`,
  `assistant.quality.export`. Host сопоставляет их со своими ролями; client-side
  флаг никогда не считается авторизацией.
- Миграции версионируются и публикуются вместе с пакетом, но применяются только
  продуктом. Нужны migration notes, обратимый путь и сохранение исторического
  аудита.
- Retention/delete/export policy задаётся host-конфигурацией и исполняется с
  tenant ownership. Audit trail оценки остаётся неизменяемым и не подменяет
  исходное сообщение.
- **Regression tests:** reviewer оценивает конкретную пару вопрос/ответ,
  сохраняет corrected answer, доступ другого tenant блокируется, export
  редактирует чувствительные поля, а повторный eval сравнивает новую revision
  без изменения исходного аудита.

### CM-008 — управляемая Knowledge Base как коробочный модуль

- **Обнаружено:** 2026-08-11. В Image Production знания пока читаются из
  статических Markdown-файлов consumer и требуют пересборки приложения.
- **Влияние:** продуктовый эксперт не может безопасно обновлять знания через
  интерфейс, невозможно точно связать ответ с опубликованной редакцией знаний,
  а каждый consumer вынужден самостоятельно собирать ingestion/editor/versioning.
- **Владелец функции:** ChatModule. База знаний должна поставляться как
  самостоятельная возможность и как часть полного chat-assistant profile.

#### Обязательные возможности Knowledge Base

- Готовая защищённая панель и headless SDK/API: список коллекций и документов,
  создание, редактирование, предпросмотр, поиск, архивирование и просмотр
  состояния индексации. UI должен встраиваться в host без копирования логики.
- Разделение `draft` и `published`, versioned revisions, diff, автор/время
  изменения, комментарий к публикации, rollback и audit trail. Ассистент читает
  только опубликованный атомарный snapshot, а не незавершённый draft.
- Поддержка как минимум ручного текста/Markdown и импортированных документов;
  дополнительные URL/file/connectors добавляются adapters без зависимости core
  от конкретного storage, parser, embedding или vector provider.
- Стабильные сущности collection/document/revision/source/chunk/index и
  citations. Каждый ответ сохраняет IDs использованных sources и точную
  `knowledgeRevision`, чтобы источники можно было показать под сообщением и
  воспроизвести ответ.
- Безопасный ingestion lifecycle: validation, chunking, indexing status,
  повторная индексация, controlled failure/retry и атомарное переключение на
  новую опубликованную revision без периода частично обновлённого индекса.
- Связь с Assistant Quality: corrected answer можно отправить в очередь
  knowledge candidates, но он не публикуется автоматически. Editor проверяет
  предложение, обновляет документ, publisher выпускает revision, после чего
  запускается regression eval.
- Импорт/экспорт коллекции с version/schema metadata для переноса между
  окружениями и продуктами. Большие исходники и индексы хранятся в настроенном
  object/vector storage, а не внутри npm-пакета или git consumer.

#### Контракты и права Knowledge Base

- Framework-neutral knowledge contracts, retrieval service и events отделены
  от UI, persistence/search/embedding/storage adapters и LLM provider.
- Минимальные permissions: `assistant.knowledge.read`,
  `assistant.knowledge.edit`, `assistant.knowledge.publish`,
  `assistant.knowledge.manage`. Retrieval агента использует server-owned
  identity и tenant scope; права редактирования никогда не передаются модели.
- Product profile задаёт enabled state, locale, limits, adapters и UI mount
  options. Host может использовать модуль отдельно без чата или вместе с
  Assistant Quality и runtime ассистента.
- Миграции и reindex commands поставляются модулем, документируются и
  запускаются consumer явно. Нужны Prisma/Drizzle compatibility tests и clean
  installed-consumer smoke test.
- **Regression tests:** draft недоступен retrieval, публикация атомарно меняет
  revision, rollback восстанавливает прошлую, другой tenant не читает документы,
  citation ведёт к точному source/revision, editor без publish permission не
  может выпустить знания.

### План будущего подключения в Image Production

До релиза этих возможностей в Image Production ничего параллельно не строим.
После stable-релиза ChatModule consumer-задача ограничивается следующими шагами:

1. Обновить версии опубликованных пакетов и пройти consumer integration checks.
2. Проверить и явно применить миграции ChatModule к настроенной PostgreSQL.
3. Подключить Better Auth workspace/tenant context и сопоставить permissions с
   продуктовыми ролями.
4. Настроить persistence/search/storage adapters и mount points готовых панелей.
5. Импортировать текущие Markdown-знания в versioned collection, проверить
   citations/retrieval и только затем переключить runtime с файлового источника.
6. Включить функции feature flags сначала локально/canary, затем stable после
   проверки tenant isolation, миграций, rollback и качества ответов.

### Общий configuration boundary и Definition of Done

Названия API ниже не являются обязательными, но публичный контракт должен
разделять включение функций, server-side авторизацию и инфраструктурные adapters:

```ts
createChatModules({
  productId,
  quality: {
    enabled: true,
    store: qualityStore,
    authorize: qualityAuthorizer,
  },
  knowledge: {
    enabled: true,
    store: knowledgeStore,
    search: knowledgeSearch,
    storage: knowledgeObjectStorage,
    authorize: knowledgeAuthorizer,
  },
});
```

- Quality и Knowledge должны устанавливаться независимо и вместе через полный
  assistant profile. Отключённый модуль не регистрирует routes/jobs и не тянет
  тяжёлые optional dependencies в browser bundle.
- UI общается только с tenant-scoped API/SDK; он не получает прямого доступа к
  базе, storage, provider key или server authorization implementation.
- Конфигурация валидируется при старте и fail closed: отсутствие auth/store или
  несовместимая schema version не должно незаметно включать in-memory fallback.
- Данные принадлежат host-продукту и хранятся в настроенной им инфраструктуре.
  ChatModule не отправляет разговоры, оценки или knowledge во внешнюю аналитику
  и не использует их для обучения без отдельного явного opt-in.
- Публичные packages имеют стабильные exports, SemVer, changelog, migration и
  rollback notes. Canary проходит package CI и clean installed-consumer tests;
  stable выпускается после проверки Next + Better Auth + Drizzle consumer и
  поддерживаемого Prisma/Nest consumer.
- Нужны доступность с клавиатуры, локализация UI, loading/empty/error states и
  тесты больших диалогов/коллекций. Product theme подключается через tokens и
  slots, без копирования компонентов в consumer.
- **Готовность для Image Production:** опубликованы packages и миграции,
  документирован RBAC/configuration API, пройдены tenant/security/reindex/eval
  regression tests и предоставлена инструкция обновления существующего
  ChatModule consumer.

### CM-021 — безопасная причина product-validation для recovery

- **Что закрыто в 0.11.0:** пакет ограниченно исправляет malformed JSON,
  schema-invalid input и несколько provider tool calls, суммирует usage и
  соблюдает общий deadline. После `CHAT_TOOL_PREPARATION_FAILED` он также может
  повторить model call. Локальный provider-boundary recovery удалён.
- **Оставшийся разрыв:** `McpToolGateway.prepareTool` может вернуть proposal либо
  бросить ошибку, но не имеет публичного типизированного контракта для
  ограниченной безопасной причины product preflight. Поэтому модель узнаёт лишь
  общий `CHAT_TOOL_PREPARATION_FAILED`, а не, например, что конкретный вход уже
  занят или типы портов несовместимы.
- **Влияние:** безопасность не нарушается — product compiler по-прежнему
  отклоняет неверный граф до записи. Но correction менее точен и может исчерпать
  две попытки на ошибке, которую можно было бы исправить с первого раза.

#### Ожидаемое пакетное решение CM-021

- Добавить framework-neutral результат подготовки или отдельную ошибку с
  allowlisted `code` и bounded `issues: { code, path }[]`; raw значения,
  названия приватных ресурсов и stack trace передавать модели нельзя.
- ChatModule самостоятельно превращает этот безопасный результат в correction
  message, учитывает его в общем `toolCallRecovery` budget и после исчерпания
  возвращает `not-started` outcome.
- Consumer только классифицирует собственные детерминированные ошибки; он не
  управляет model loop, usage, retries или provider messages.
- **Regression tests:** несовместимый port type, занятый single-input, stale
  product revision, повторно невалидная correction, redaction и отсутствие
  выполнения до успешной подготовки.

### CM-022 — focus-only keyboard policy composer

- **Статус:** `consumer-verified` в exact-version семье ChatModule 0.12.0.
- **Обнаружено:** 2026-08-21 при работе Visual Intent поверх Image Production.
- **Проблема:** `ChatComposer` 0.11.0 регистрирует `window.keydown` и направляет
  печать, Enter, Backspace и `select all` в свою textarea, даже когда фокус
  находится вне чата. В Shadow DOM внешний textarea ретаргетируется в host, из-за
  чего проверка обычного `event.target` не распознаёт editable control.
- **Влияние:** открытый чат мешает canvas shortcuts и вводу комментария Visual
  Intent; пользователь может незаметно изменить или отправить текст чата.
- **Поставлено в 0.12.0:** публичная policy `focused` по умолчанию, при которой
  composer обрабатывает клавиатуру только если его textarea/command surface
  активны. Опциональный global typing mode допустим только как явный opt-in.
  Проверка внешних editable controls должна использовать `composedPath()` и
  корректно работать с Shadow DOM.
- **Публичные extension points:** host должен иметь возможность выбрать policy и
  получить focus state callback без доступа к package internals.
- **Consumer-проверка:** textarea чата отправляет Enter; canvas получает свои
  shortcuts при открытом чате; обычный input и textarea в Shadow DOM не меняют
  inputValue чата; закрытый/compact/expanded shell не оставляет window listeners.
  Host явно передаёт `composerKeyboardPolicy="focused"`, а локальные focus state,
  document-level keydown listener и CW-011 удалены без форка ChatModule.

### CM-023 — retry обязан сохранять проверенный контекст исходного turn

- **Статус:** `consumer-verified` в exact-version семье ChatModule 0.12.0.
- **Обнаружено:** 2026-08-25 в реальном диалоге Image Production при повторе
  неуспешной сборки графа.
- **Evidence:** исходный turn успешно выполнял `document_graph` в выбранном
  документе. Штатный Retry восстановил текст и attachments, но следующий
  `document_graph` завершился причиной `A verified document context is required`.
  В опубликованном runtime 0.11.0 `retryTurn` не переносит сохранённые
  `contextSelectors` из metadata исходного user message в новый retry request.
- **Влияние:** безопасный read-only повтор теряет document/route/selection
  context, хотя пользователь остаётся в том же диалоге и документе. Ассистент
  не может восстановить graph revision и предлагает пользователю повторять
  согласование или формулировку.
- **Поставлено в 0.12.0:** Retry загружает сохранённые selectors
  исходного user message, повторно прогоняет их через host-owned
  `verifiedContextResolver` и передаёт только заново проверенный context.
  Browser selectors не должны становиться доверенными данными.
- **Consumer-проверка:** retry document-scoped turn сохраняет document selector;
  смена membership или revision проверяется заново; другой tenant блокируется;
  повтор не создаёт дубликат user message; attachments и context восстанавливаются
  атомарно.
- **Удалённый consumer workaround:** CW-015 больше не читает metadata и binding
  текущей conversation. Resolver принимает пакетные selectors, заново проверяет
  workspace/document/revision и сохраняет fail-closed поведение для `unsaved:*`.
- **Consumer boundary:** Image Production не копирует `ToolCallingChatAgent` и
  не подменяет retry-route локальным fork.
- **Отдельная задача:** CM-026 остаётся открытой. Она относится не к отдельному
  Retry, а к revision drift внутри уже выполняющегося model turn.

### CM-024 — безопасная диагностика invalid tool input

- **Обнаружено:** 2026-08-25 после двух штатных попыток `toolCallRecovery`.
- **Evidence:** turn завершился `CHAT_TOOL_INPUT_INVALID`, однако невалидные
  provider arguments и нормализованные JSON Schema issues не были сохранены.
  По аудиту можно доказать только факт malformed/schema-invalid input, но нельзя
  определить конкретное поле без повторного воспроизведения.
- **Влияние:** пользователь видит общий текст «Review the request and try
  again», product-команда не понимает, сломалось ли имя edge-поля, setting или
  размер payload, а feedback loop требует ручного расследования БД и логов.
- **Ожидаемое пакетное решение:** сохранять и показывать bounded redacted
  diagnostics: `toolName`, issue code, JSON path, recovery attempt и конечную
  человекочитаемую категорию. Raw values, message text, provider payload,
  credentials и stack trace не сохранять и не показывать.
- **Пользовательское представление:** после внутренних попыток — одно сообщение
  вроде «Не удалось подготовить ноду QR Code: поле settings.defaultValue не
  поддерживается. Проект не изменён», плюс Retry. Если причина безопасно не
  классифицирована, честно сообщить «модель вернула параметры неверного формата».
- **Regression tests:** malformed JSON, unknown property, missing required
  field, redaction, два recovery attempts и один terminal error без повторного
  user confirmation.

### CM-025 — защита step budget от повторных read-tools

- **Обнаружено:** 2026-08-25 в том же диалоге: до первого write proposal модель
  вызвала `node_catalog` 14 раз, `document_graph` 5 раз и `knowledge_search` 2
  раза; один turn завершился `CHAT_AGENT_STEP_LIMIT_EXCEEDED`.
- **Влияние:** одинаковые server-owned ответы повторно попадают в model context,
  увеличивают tokens/latency и не оставляют шага для целевого write proposal.
- **Ожидаемое пакетное решение:** публичная bounded policy для дедупликации или
  cycle detection read-only tool calls внутри одного turn. Fingerprint должен
  учитывать tool name, canonical input и проверенную context revision. Повтор
  возвращает компактную ссылку на уже полученный результат либо correction
  «используй предыдущий результат», не выполняя внешний read заново.
- **Regression tests:** одинаковый read одного revision выполняется один раз;
  другой query или новая revision не дедуплицируются; write tools никогда не
  кэшируются; tenant/context входят в fingerprint.

### CM-026 — typed recovery при изменении verified context внутри turn

- **Обнаружено:** 2026-08-25 в реальном диалоге Image Production при сборке
  графа через `pipeline_build`.
- **Evidence:** turn начался с server-verified revision `42`. Пока модель
  готовила параметры действия, документ штатно сохранился и перешёл на revision
  `45`. OpenRouter успешно вернул валидный tool call, но product `prepareTool`
  отклонил устаревший context. ChatModule заменил конкретную причину общим
  `CHAT_TOOL_PREPARATION_FAILED` и текстом «The requested action could not be
  prepared safely». Provider moderation/refusal не происходил, proposal и
  изменение проекта не создавались.
- **Проблема:** нормальный revision drift во время длинного agent turn выглядит
  как неизвестная небезопасная ошибка. Модель не получает классифицированной
  причины и не может безопасно обновить context без повторного вопроса. Это не
  CM-023: context здесь не потерян отдельным Retry, а устарел внутри текущего
  turn.
- **Влияние:** document-scoped write tools нестабильны при autosave; повторные
  model calls расходуют latency, tokens и recovery budget, хотя intent и доступ
  пользователя не менялись.

#### Ожидаемое пакетное решение CM-026

- Публичный preparation contract поддерживает typed safe outcome, например
  allowlisted `CHAT_TOOL_CONTEXT_STALE` с category `context-conflict`,
  `retryable: true` и recovery hint `refresh-verified-context`. Raw selectors,
  document contents, tenant resource names, revision values, provider payload и
  stack trace наружу не передаются.
- ChatModule один раз в пределах общего recovery/deadline budget повторно
  вызывает host-owned verified-context resolver и `prepareTool` с тем же intent
  и idempotency scope. Browser revision не становится доверенной.
- Если host сообщает, что изменения существуют только в browser (`unsaved`),
  пакет ждёт штатного сохранения либо возвращает один понятный `not-started`
  outcome; он не готовит proposal по заведомо старой серверной копии.
- После успешного refresh пользователь получает один актуальный preview и одно
  подтверждение без нового текстового вопроса. Повторный drift завершает turn
  одним `not-started` error без бесконечного цикла.
- Product validation после refresh маршрутизируется через CM-021, invalid model
  schema — через CM-024. Membership/tenant rejection всегда остаётся fail
  closed.
- **Граница:** ChatModule владеет orchestration recovery, idempotency, redaction
  и terminal presentation. Image Production владеет identity/workspace checks,
  актуальной document revision, компиляцией graph proposal, concurrency token и
  финальным выполнением.
- **Regression tests:** revision меняется между model call и prepare; refresh
  выполняется один раз; пользователь видит один preview; membership revoke
  блокирует write; повторный conflict не зацикливается; user message, approval,
  usage и execution не дублируются; до подтверждения mutation отсутствует.
- **Временный consumer workaround:** CW-012. Удалить после exact-version
  обновления ChatModule и consumer-проверки реального autosave/revision drift.

### CM-027 — универсальный lifecycle интерактивного ответа

- **Обнаружено:** 2026-08-26 при разборе рекламного референса в Image
  Production. Модель уже может перечислить найденные объекты, но пользователю
  приходится вручную перепечатывать, какие из них должны редактироваться
  отдельно.
- **Влияние:** диалог становится длиннее, допускает неоднозначный свободный
  текст и провоцирует лишние подтверждения до настоящего action preview.
- **Временный consumer workaround:** Image Production поставляет product-owned
  read-tool `design_element_selection`, предметную модель объектов макета и
  собственный renderer карточки множественного выбора. Это нужно для проверки
  UX и дизайнерской семантики, а не как постоянный форк ChatModule.

#### Ожидаемое пакетное решение CM-027

- Универсальный framework-neutral interaction contract для `single-choice`,
  `multi-choice` и опционального custom input: стабильный `interactionId`,
  version, labels/descriptions, defaults, recommended options, min/max selection
  и локализованный action label. Option может нести bounded host-owned
  structured value/metadata, которое ChatModule сохраняет и возвращает без
  интерпретации; предметная схема этого значения принадлежит продукту.
- Коробочный доступный React renderer с keyboard/focus states, loading,
  validation, submitted/expired/retry states и product theme slots. Карточка
  после отправки сохраняет выбранный результат и не превращается обратно в
  пустой вопрос после reload.
- Результат продолжается в том же conversation/turn lineage как типизированный
  `selectedAction.payload` и как канонический человекочитаемый текст для
  провайдеров без native structured interaction. Повторная отправка одного
  `interactionId` идемпотентна.
- Интерактивный ответ не считается разрешением на mutation. Если следующий шаг
  — write tool, пользователь подтверждает только штатный action preview.
- Host владеет предметными options и маппингом payload в продуктовые контракты;
  ChatModule владеет lifecycle, persistence, accessibility, replay и transport.
- **Regression tests:** multi-select + custom value, reload/resume, duplicate
  submit, expired interaction, Retry, localization, keyboard navigation,
  неизменность graph до отдельного write approval и tenant isolation.
- **Условие удаления workaround:** опубликована exact-version семья пакетов,
  Image Production заменил локальную карточку package renderer и повторно
  проверил выбор -> pipeline preview -> единственное подтверждение.

### CM-028 — гарантированная доставка tool-call вместе с ответом turn

- **Статус:** `consumer-verified` в exact-version семье ChatModule 0.12.0.
- **Обнаружено:** 2026-08-26 в реальном сценарии выбора редактируемых объектов
  рекламного макета. `design_element_selection` успешно завершился и сохранил
  12 вариантов, финальный текст ассистента появился, но карточка не попала в
  live runtime до reload.
- **Причина:** terminal turn stream и persistent conversation events являются
  разными каналами. После turn runtime переподключает persistent stream; при
  отсутствии cursor новая tail-only подписка может начать с latest и пропустить
  уже сохранённый `tool_call_completed`.
- **Влияние:** ассистент обещает выбор, которого пользователь не видит, хотя
  модель, provider, product tool и persistence отработали успешно.
- **Поставлено в 0.12.0:** `streamTurn`/`retryTurn` co-stream события tool
  lifecycle в основном SSE до terminal completion. SDK передаёт их штатному
  `onEvent`, поэтому получение карточки не зависит от tail-only reconnect.
- **Consumer-проверка:** completed read-tool виден в том же ответе без reload;
  delayed persistent event не теряется при reconnect; duplicate replay не
  дублирует карточку; retry ведёт себя так же; ошибка reconciliation не заменяет
  успешный ответ ошибкой.
- **Удалённый consumer workaround:** Image Production снова использует обычный
  `RestSseChatClient`; тест подтверждает ровно одно `tool_call_completed` из turn
  stream и отсутствие дополнительного GET conversation. CW-014 удалён.

## Новые наблюдения

Следующее замечание добавляется сюда с новым ID, датой, воспроизведением и
ожидаемым поведением. До накопления согласованного пакета этот документ является
source of truth для следующего патч-релиза ChatModule.
