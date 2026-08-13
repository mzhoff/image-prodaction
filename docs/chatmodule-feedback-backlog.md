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
`upstream-fixed`.

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
которые уже поставлены ChatModule 0.7.0 и повторно проверены в Image Production,
удалены из рабочего списка; их история остаётся в Git и в retirement ledger.
Product-specific поведение Image Production сюда также не включается.

| ID | Приоритет | Область | Статус | Кратко |
| --- | --- | --- | --- | --- |
| CM-007 | P1 | Assistant Quality / evaluation / UI / SDK | `ready-for-upstream` | Нет коробочной панели анализа и улучшения ответов |
| CM-008 | P1 | Knowledge Base / UI / retrieval / persistence | `ready-for-upstream` | Нет управляемой и версионируемой базы знаний как модуля |
| CM-011 | P1 | application / SSE / product actions | `ready-for-upstream` | Ошибка prepare превращается в HTTP 500 и не даёт агенту исправить аргументы |
| CM-012 | P0 | agent / SSE / runtime / UI | `workaround-active` | Нет честного backend-driven прогресса долгого agent turn |
| CM-013 | P0 | SDK / runtime / UI / idempotency | `workaround-active` | Ошибка не содержит достаточного контракта для безопасного повтора запроса |
| CM-014 | P2 | `chat-ui` / activity label | `workaround-active` | CSS анимированных точек ломает вложенный public `activityLabel` |
| CM-015 | P1 | runtime / `chat-ui` / tool status | `workaround-active` | Сохранённый confirmation block дублирует tool card и остаётся после выполнения |
| CM-016 | P0 | connector / agent / usage / retry policy | `workaround-active` | Transient provider failure требует ручного повтора всего user turn |

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

### CM-011 — recoverable ошибка подготовки product action

- **Обнаружено:** 2026-08-12, первый живой `pipeline_build` в Image Production.
- **Evidence:** модель передала допустимое по общему JSON Schema, но чужое для
  конкретной ноды поле. Product gateway безопасно отклонил input, однако
  `proposeToolCall()` отбросил причину, а SSE route завершился HTTP 500. В UI
  пользователь увидел только `network error`; failed tool-call audit не был
  создан, потому что ошибка случилась до `createToolCall()`.
- **Consumer mitigation:** схема `pipeline_build` стала discriminated per-node,
  а безопасные misplaced settings пропускаются с заметным warning в preview.
  Server-only журнал сохраняет ограниченные `errorName/errorMessage/toolCallId`.
- **Ожидаемое исправление:** preparation failure не должен ломать весь stream.
  ChatModule должен вызвать protected reporter, сохранить failed proposal audit
  и вернуть модели структурированный safe tool result для одного исправляющего
  шага либо показать пользователю понятную retryable ошибку. Raw exception и
  input не выходят в browser.
- **Regression tests:** invalid proposal input даёт завершённый SSE lifecycle,
  один audit record и safe error; модель может исправить tool args в пределах
  лимита; повтор не создаёт proposal; protected reporter получает cause, а UI
  не получает stack/provider payload.
- **Повторное подтверждение, 2026-08-12:** после успешного `node_catalog` второй
  model call вернул невалидный `pipeline_build`; `chat_llm_calls` сохранил его
  как успешный оплаченный вызов, но tool-call audit не появился, turn получил
  `CHAT_AGENT_RUN_FAILED`, а Next stream завершился `failed to pipe response`.
  Browser снова увидел только `network error`. Это подтверждает, что проблема
  находится в универсальном lifecycle между provider result validation и SSE,
  а не в OpenRouter, сети или product execute.
- **Повторное подтверждение, 2026-08-13:** два `pipeline_update` прошли JSON
  Schema и дошли до product prepare, но первый попытался занять
  уже подключённый вход, а второй соединил несовместимые порты.
  Оба LLM call записаны как `success`, оба turn как
  `CHAT_AGENT_RUN_FAILED`, а failed `chat_tool_calls` нет, потому что
  `prepareTool()` вызывается до `createToolCall()`. Это ожидаемая
  валидационная ошибка, которая должна возвращаться агенту как
  safe tool result для одной коррекции, а не обрывать SSE.

### CM-012 — backend-driven прогресс долгого agent turn

- **Обнаружено:** 2026-08-12, финальный запрос на сборку пайплайна.
- **Evidence:** после отправки UI 45 секунд показывал только локальное
  `Assistant is thinking`, хотя внутри turn могли последовательно выполняться
  model call, чтение знаний, чтение каталога, подготовка product action и анализ
  результата. `ToolCallingChatAgent.streamTurn()` публикует `run.started`, затем
  блокируется на `createTurn()`; runtime не получает промежуточные typed phases.
- **Влияние:** пользователь не отличает нормальную долгую работу от зависания и
  не понимает, безопасно ли ждать или отменять запрос.
- **Ожидаемое исправление:** ChatModule публикует упорядоченные server-owned
  lifecycle events как минимум для `accepted`, `resolving-context`,
  `waiting-for-model`, `tool-proposed`, `tool-running`, `analyzing-result` и
  `finalizing`. Event содержит `turnId`, `requestId`, sequence, `startedAt` и
  `updatedAt`; текущее состояние сохраняется и восстанавливается после reload
  или SSE reconnect. Для долгих пауз stream отправляет heartbeat, а terminal
  success/cancel/timeout/error всегда закрывает activity.
- **Приватность:** UI показывает только операционный этап, но никогда не
  chain-of-thought, скрытые рассуждения, raw prompt или tool payload. Текст этапа
  локализуется UI либо приходит как безопасный presentation label.
- **UI contract:** package предоставляет стандартный activity renderer с
  прошедшим временем и публичный slot/policy для consumer theme. Таймер считается
  на клиенте от server `startedAt`, поэтому переключение вкладки не обнуляет его.
- **Regression tests:** первый и существующий conversation, model/tool/model,
  reconnect по `Last-Event-ID`, heartbeat через reverse proxy, cancel и timeout;
  события монотонны, не дублируются и после terminal state индикатор исчезает.

### CM-013 — структурированная ошибка и безопасный retry

- **Обнаружено:** 2026-08-12, тот же turn.
- **Evidence:** SDK отменил запрос ровно через 45 секунд, одновременно с timeout
  OpenRouter connector. Runtime сохранил только строку ошибки, а синтетический
  error block всегда получил `retryable: true`; UI не знает `code`, реальный
  `retryable`, `turnId/requestId`, `retryAfter` и могло ли действие начаться.
- **Влияние:** безусловный «Повторить» может создать второй turn, proposal,
  списание или, для менее защищённого consumer tool, повторить изменение.
- **Ожидаемое исправление:** runtime сохраняет структурированный safe error:
  `code`, `retryable`, `category`, `turnId`, `requestId`, `attempt`,
  `retryAfterMs` и `executionState` (`not-started`, `read-only`, `ambiguous`,
  `mutated`). Package показывает одну, а не две error-панели и стандартную
  кнопку retry только для разрешённых состояний.
- **Retry semantics:** повтор является отдельной typed операцией/attempt со
  ссылкой на исходный turn и исходным message, сохраняет idempotency contract и
  сначала reconciles состояние при `ambiguous`. Write action нельзя исполнять
  повторно без нового preview/confirmation; completed turn возвращает прежний
  результат, а running turn не запускается параллельно.
- **Presentation/history semantics:** повтор использует тот же логический user
  message и не добавляет второй одинаковый bubble в UI или второй одинаковый
  prompt в model context. Отдельные attempts остаются доступными в audit, но не
  маскируются под новые пользовательские сообщения.
- **Timeout contract:** provider timeout, server turn deadline и SDK deadline
  конфигурируются раздельно и идут с запасом в этом порядке. Server успевает
  сохранить terminal outcome и отправить error до client cancellation.
- **Regression tests:** provider timeout, offline/network, 408/429/5xx,
  non-retryable 4xx, первый turn без conversation id, retry после read tool,
  ambiguous write, двойной клик и reload/reconnect. Ни один сценарий не создаёт
  двойного изменения или usage charge.

### CM-014 — CSS индикатора не должен ломать custom activity label

- **Обнаружено:** 2026-08-12, Image Production с public `activityLabel`.
- **Evidence:** `.cm-typing span` задаёт каждому вложенному `span` ширину и
  высоту `7px`, фон и pulse-анимацию. Поэтому `span` внутри переданного
  `activityLabel` превращается в дополнительную точку, а текст статуса
  сжимается и переносится, хотя места в панели достаточно.
- **Влияние:** публичный ReactNode-slot нельзя безопасно использовать для
  составной подписи этапа и таймера без знания внутренних CSS-селекторов пакета.
- **Consumer workaround:** Image Production сбрасывает dot-геометрию только для
  `.image-production-chat-activity` и принудительно сохраняет статус в одну
  строку.
- **Ожидаемое исправление:** стили точек должны применяться только к трём прямым
  дочерним элементам (`.cm-typing > span`) либо к отдельному публичному классу
  dot. Контейнер и `b` должны разрешать произвольный `activityLabel`, включая
  вложенные элементы, без навязывания им размеров, фона и animation.
- **Regression tests:** ReactNode из текста и `<time>` остаётся в одну строку;
  его вложенные элементы не анимируются, три штатные точки продолжают
  пульсировать, длинная локализованная подпись не ломает composer.

### CM-015 — confirmation status не должен дублироваться и устаревать

- **Обнаружено:** 2026-08-12, успешный подтверждённый `pipeline_build`.
- **Evidence:** ChatModule сохраняет отдельное assistant message с блоком
  `tool-status(status=needs-confirmation)` и одновременно показывает связанную
  интерактивную `ChatToolCallPanel`. После подтверждения tool call в PostgreSQL
  имеет `completed`, но неизменяемый message block продолжает показывать
  «Требуется подтверждение» после reload.
- **Влияние:** во время ожидания пользователь видит два одинаковых сообщения, а
  после успешного действия одно из них сообщает заведомо неверное состояние.
- **Consumer workaround:** Image Production скрывает `tool-status` blocks и
  оставляет единственным источником состояния package tool panel/result card.
- **Ожидаемое исправление:** ChatModule должен иметь один source of truth для
  lifecycle tool call. Либо status block вычисляется по живой записи tool call,
  либо не создаётся, когда UI уже рендерит связанную confirmation card. Terminal
  `completed/rejected/expired/failed` обязан заменить или убрать pending status
  при текущем turn, reload и reconnect.
- **Regression tests:** pending write показывает одну карточку с действиями;
  после confirm отображается только completed result, после reject — terminal
  result; reload/reconnect не возвращают `needs-confirmation`.

### CM-016 — bounded provider retry внутри одного agent turn

- **Обнаружено:** 2026-08-12, доработка существующего Telegram pipeline.
- **Evidence:** три последовательных turn завершились через 5 секунд с
  `OPENROUTER_NETWORK_ERROR`, нулевыми токенами и без tool call. Пользователь
  вручную повторял одну реплику, хотя ошибка возникла до product action.
- **Влияние:** технический transient сбой превращается в пользовательскую
  работу, засоряет историю отдельными turns и заставляет модель повторно читать
  весь контекст. При этом безусловный retry всего turn небезопасен после write
  proposal и может повторить действие или списание.
- **Consumer workaround:** Image Production connector делает до трёх попыток
  одного provider call с bounded exponential backoff. Это происходит внутри
  исходного turn до передачи результата agent lifecycle. 401/402/403,
  cancellation и другие permanent ошибки не повторяются; после исчерпания
  лимита ошибка возвращается пользователю.
- **Ожидаемое исправление:** ChatModule connector принимает typed retry policy:
  max attempts, backoff/jitter, retryable codes, `Retry-After`, общий deadline и
  protected attempt reporter. Runtime различает provider attempt и user turn,
  не добавляет повторный user message и сохраняет реальное суммарное usage.
  Retry после tool proposal/execution подчиняется execution state CM-013, а не
  connector policy.
- **Regression tests:** network/DNS, timeout, 429 с `Retry-After`, 502/503/504,
  401/402/403, cancel во время backoff, исчерпание attempts и успешное
  восстановление. Один user turn и одно сообщение сохраняются; usage всех
  оплаченных попыток учитывается; product write не исполняется дважды.

## Новые наблюдения

Следующее замечание добавляется сюда с новым ID, датой, воспроизведением и
ожидаемым поведением. До накопления согласованного пакета этот документ является
source of truth для следующего патч-релиза ChatModule.
