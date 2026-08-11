# ChatModule integration feedback backlog

Этот документ накапливает замечания, найденные при реальном использовании
ChatModule в Image Production. Мы не выпускаем новую версию внешнего пакета на
каждое наблюдение: сначала собираем подтверждённый пакет изменений, затем
передаём его команде ChatModule одним релизным циклом и повторяем consumer tests.

## Как вести документ

- Каждое новое наблюдение получает постоянный ID и дату.
- Отдельно фиксируются evidence, влияние, временный consumer workaround и
  ожидаемое изменение внешнего пакета.
- Product-specific улучшения остаются в отдельном разделе и не выдаются за
  дефект универсального модуля.
- Запись закрывается только после публикации пакета и повторной проверки в
  установленном consumer, а не после одного теста внутри ChatModule.

Статусы: `observed`, `workaround-active`, `ready-for-upstream`,
`upstream-fixed`, `consumer-verified`, `product-only`.

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

## Кандидаты в следующий релиз ChatModule

| ID | Приоритет | Область | Статус | Кратко |
| --- | --- | --- | --- | --- |
| CM-001 | P1 | `chat-sdk` | `workaround-active` | Browser `fetch` вызывается с неправильным receiver |
| CM-002 | P1 | contracts / agent | `workaround-active` | Tool name не проверяется на совместимость с OpenAI |
| CM-003 | P0 | Next runtime / SDK / core | `workaround-active` | SSE payload расходится с типом `ChatTurnResponse` |
| CM-004 | P2 | OpenRouter connector | `ready-for-upstream` | Нет защищённой диагностики тела provider error |
| CM-005 | P1 | `chat-ui` / contracts | `workaround-active` | Tool calls всегда выводятся общим списком после сообщений |
| CM-006 | P2 | `chat-ui` | `workaround-active` | Подписи авторов нельзя скрыть независимо от avatar/bubble |
| CM-007 | P1 | Assistant Quality / evaluation / UI / SDK | `ready-for-upstream` | Нет коробочной панели анализа и улучшения ответов |
| CM-008 | P1 | Knowledge Base / UI / retrieval / persistence | `ready-for-upstream` | Нет управляемой и версионируемой базы знаний как модуля |
| CM-009 | P1 | `chat-ui` / embedded surfaces | `workaround-active` | Лента не следует за новым сообщением и typewriter-анимацией |

### CM-001 — browser fetch receiver

- **Обнаружено:** 2026-08-11, Image Production + Chrome.
- **Evidence:** отправка сообщения падала с
  `Failed to execute 'fetch' on 'Window': Illegal invocation` до вызова API.
- **Причина:** `RestSseChatClient` сохраняет глобальный `fetch`, а затем вызывает
  его как метод экземпляра клиента.
- **Consumer workaround:** передавать
  `globalThis.fetch.bind(globalThis)` в `fetcher`.
- **Ожидаемое исправление:** SDK сам создаёт корректно привязанный default
  fetcher; consumer не обязан знать о browser receiver.
- **Regression test:** browser-like fetch, который проверяет receiver, проходит
  через `createChatClient` без пользовательской настройки `fetcher`.

### CM-002 — provider-safe tool names

- **Обнаружено:** 2026-08-11, `openai/gpt-5.4-nano` через OpenRouter.
- **Evidence:** первый model call принимал `knowledge.search`, но следующий call
  с tool result получал HTTP 400: имя не соответствует
  `^[a-zA-Z0-9_-]+$`.
- **Consumer workaround:** tools переименованы в `knowledge_search` и
  `node_catalog`, добавлен consumer regression test.
- **Ожидаемое исправление:** валидировать server-owned tool definitions при
  сборке агента и возвращать понятную configuration error до provider call.
- **Regression test:** несовместимое имя отклоняется локально; `_` и `-`
  принимаются во всём tool-call lifecycle.

### CM-003 — SSE turn result contract

- **Обнаружено:** 2026-08-11, полный успешный model/tool turn.
- **Evidence:** сервер завершал `/chat/v1/turn/stream` с HTTP 200, после чего
  `chat-runtime-core` падал на `result.userMessage`/`assistantMessage` как
  `undefined`.
- **Причина:** `chat-runtime-next` отображает `message.completed` в SSE
  `message` с `ChatMessage`, а `run.completed` — в `done` с
  `ChatTurnResponse`. `chat-sdk` принимает payload `message` за итоговый
  `ChatTurnResponse` и игнорирует payload `done`.
- **Consumer workaround:** runtime transport временно вызывает JSON endpoint
  `/chat/v1/turn`. Cancel signal сохраняется, UI/runtime contract не меняется.
- **Ожидаемое исправление:** единый типизированный wire contract; SDK возвращает
  `ChatTurnResponse` только из события, которое действительно содержит полный
  результат.
- **Regression test:** сквозной тест
  `chat-runtime-next -> chat-sdk -> chat-runtime-core` с model/tool turn.

### CM-004 — protected OpenRouter diagnostics

- **Обнаружено:** 2026-08-11 при диагностике provider HTTP 400.
- **Evidence:** публичная ошибка безопасно обезличивалась, но server-side
  `OpenRouterRequestError` сохранял только status/code и отбрасывал полезное
  тело ответа. Точную причину пришлось воспроизводить отдельным запросом.
- **Consumer workaround:** отсутствует; публичный канал намеренно остаётся
  безопасным.
- **Ожидаемое исправление:** optional server-only protected error reporter с
  redaction и ограничением размера. Raw provider payload не должен попадать в
  browser, chat history или model context.
- **Regression test:** protected reporter получает диагностический код, а
  публичная ошибка не содержит provider body, prompt или credentials.

### CM-005 — привязка tool calls и источников к ответу

- **Обнаружено:** 2026-08-11, ответы по knowledge base в Image Production.
- **Evidence:** `ChatModuleShell` рендерит все `toolCalls` после всего массива
  сообщений и показывает raw JSON input. В consumer snapshot все 14 вызовов
  связаны через `messageId` с вопросами пользователя, но ни один не имеет
  `agentResponseMessageId`; у 25 LLM calls также не заполнен
  `responseMessageId`.
- **Влияние:** пользователь видит внутренние `knowledge_search` вместо
  компактных источников и не может понять, к какому ответу они относятся.
- **Consumer workaround:** Image Production показывает только
  `needs-confirmation` и `failed`; завершённые read-only вызовы остаются в
  PostgreSQL для аудита, но скрываются из пользовательского чата.
- **Ожидаемое исправление:** заполнить связь tool/LLM call с итоговым assistant
  message и добавить presentation policy или slot: скрыть технические детали,
  показать под конкретным ответом компактный блок «Источники», раскрываемый по
  запросу. Raw input/output не должен быть default end-user UI.
- **Regression test:** два tool calls одного turn отображаются под его
  assistant message, а следующий ответ получает собственную группу источников.

### CM-006 — visibility авторов сообщений

- **Обнаружено:** 2026-08-11, `showAssistantAvatar: false` и
  `assistantBubble: false`.
- **Evidence:** avatar и bubble скрываются, но `MessageMeta` продолжает выводить
  фиксированные имена `Assistant` и `User`; публичных appearance-параметров для
  авторов и времени нет.
- **Consumer workaround:** Image Production скрывает обе author labels scoped
  CSS, сохраняя время сообщений.
- **Ожидаемое исправление:** типизированные настройки
  `showAssistantAuthor`/`showUserAuthor`/`showMessageTime` либо единая
  role-aware presentation policy. Support-agent identity должна настраиваться
  отдельно и не исчезать случайно вместе с подписями обычного диалога.
- **Regression test:** assistant/user author visibility управляется без CSS
  override, время остаётся доступным, support-agent presentation не затронут.

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

### CM-009 — follow-to-latest и scroll contract в embedded chat

- **Обнаружено:** 2026-08-11 при длинном ответе в side-panel поверх pipeline
  canvas.
- **Evidence:** `.cm-thread` имеет `overflow-y: auto`, но `ChatModuleShell` не
  хранит ref/состояние позиции и после `onSubmit` не прокручивает ленту. Когда
  `ChatRichText` постепенно увеличивает высоту typewriter-ответа, viewport
  остаётся на старом участке переписки.
- **Влияние:** пользователь отправляет вопрос и не видит ни своё новое
  сообщение, ни индикатор работы, ни печатающийся ответ без ручной прокрутки.
- **Consumer workaround:** Image Production при submit включает follow mode,
  прокручивает `.cm-thread` вниз и через `ResizeObserver` удерживает нижнюю
  границу во время роста ответа. Ручной уход пользователя от нижней границы
  отключает follow до возврата вниз или следующей отправки.
- **Ожидаемое исправление:** ChatModule сам владеет scroll lifecycle:
  - новый submit немедленно показывает отправленное сообщение и typing state;
  - пока идёт streaming/typewriter, последняя строка остаётся над composer, а
    растущий текст уходит вверх;
  - ручной scroll вверх прекращает принудительное следование и показывает
    доступную с клавиатуры кнопку «К последнему сообщению»;
  - возврат к нижней границе или новый submit снова включает follow;
  - короткий диалог выравнивается по нижней границе, scroll position не
    сбрасывается при переключении вкладок/режимов;
  - embedded thread имеет `overscroll-behavior: contain` и стабильный
    ref/data-атрибут или typed scroll adapter для интеграции с canvas hosts.
- **Публичный контракт:** sensible default внутри `ChatModuleShell` плюс
  optional typed policy/callbacks для `autoFollow`, bottom threshold,
  jump-to-latest visibility и уведомления о follow state. Consumer не должен
  query-select внутренние `.cm-*` классы.
- **Regression tests:** submit из середины длинной истории переходит вниз;
  typewriter удерживает нижнюю границу; ручной scroll вверх не перетягивается
  обратно; новый submit возобновляет follow; side-panel не прокручивает
  расположенный под ним canvas.

## Product-specific наблюдения Image Production

| ID | Статус | Наблюдение |
| --- | --- | --- |
| IP-001 | `product-only` | Для вопроса «продукт + ноды + пайплайн» нужны до трёх read-only tool calls; лимит остаётся server-owned и ограничен cost guard. |
| IP-002 | `product-only` | Общий запрос к `node_catalog` не должен создавать ложный ответ «нод нет»: consumer возвращает ограниченный полный реестр, если фильтр ничего не нашёл. |
| IP-003 | `product-only` | Размер и жизненный цикл плавающей панели принадлежат host UI: Image Production ограничивает resize сверху/слева и не размонтирует чат при переходе на Feedback. |
| IP-004 | `product-only` | ChatModule 0.5.1 уже поддерживает Markdown и typewriter через semantic blocks/metadata; consumer преобразует assistant text в Markdown и анимирует только последний ответ. |
| IP-005 | `product-only` | До появления per-message source presentation consumer скрывает завершённые read-only tool cards, но не удаляет их audit records из PostgreSQL. |
| IP-006 | `product-only` | Production canvas обязан уступать wheel/pan события интерактивному overlay ассистента; host помечает shell как canvas-wheel boundary, а canvas navigation не обрабатывает события из этой области. |

## Новые наблюдения

Следующее замечание добавляется сюда с новым ID, датой, воспроизведением и
ожидаемым поведением. До накопления согласованного пакета этот документ является
source of truth для следующего патч-релиза ChatModule.
