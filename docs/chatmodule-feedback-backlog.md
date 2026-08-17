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
которые уже поставлены ChatModule 0.9.0 и повторно проверены в Image Production,
удалены из рабочего списка; их история остаётся в Git и в retirement ledger.
Product-specific поведение Image Production сюда также не включается.

| ID | Приоритет | Область | Статус | Кратко |
| --- | --- | --- | --- | --- |
| CM-007 | P1 | Assistant Quality / evaluation / UI / SDK | `ready-for-upstream` | Нет коробочной панели анализа и улучшения ответов |
| CM-008 | P1 | Knowledge Base / UI / retrieval / persistence | `ready-for-upstream` | Нет управляемой и версионируемой базы знаний как модуля |
| CM-017 | P1 | Attachments / drop zone / event boundary | `workaround-active` | Drop принимает только composer, нет состояния всей зоны и безопасной границы с host UI |
| CM-018 | P2 | Attachments / composer presentation | `workaround-active` | Managed attachments показаны техническим списком вместо компактных превью |
| CM-019 | P1 | Attachments / model delivery | `workaround-active` | Один read target используется и браузером, и внешним AI-провайдером |
| CM-020 | P1 | Runtime / first-turn failure | `ready-for-upstream` | Conversation ID теряется, если самый первый turn завершился ошибкой |
| CM-021 | P1 | Agent runtime / tool validation recovery | `workaround-active` | Invalid или parallel provider tool call до prepareTool завершает turn общей ошибкой |

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

### CM-017 — универсальная drop-zone вложений для всей области чата

- **Обнаружено:** 2026-08-13 при drag-and-drop изображения в плавающую панель
  Image Production поверх canvas.
- **Evidence:** пакетный `ChatComposer` обрабатывает drop только внутри формы
  ввода и не публикует состояние file-drag для внешней оболочки. При drop над
  другой частью панели событие достигает host canvas, который одновременно
  создаёт собственную Import-ноду.
- **Влияние:** одно действие пользователя может иметь два разных результата, а
  отсутствие подсветки не показывает, какая поверхность примет файл.
- **Временный workaround:** consumer перехватывает file drag на capture-фазе во
  всей `AssistantShell`, показывает overlay и передаёт файлы публичному
  `useChatAttachments().addFiles`. Код отмечен как временный и не копирует
  storage/upload lifecycle пакета.

#### Ожидаемое пакетное решение CM-017

- Публичный headless hook или wrapper-компонент для произвольной drop-зоны:
  `isFileDragActive`, типизированные handlers и вызов штатного attachment
  controller. Host должен иметь возможность обернуть как `ChatModuleShell`, так
  и собственный header/tabs без доступа к внутренним компонентам пакета.
- Drop-zone принимает только поддерживаемые файлы, вызывает `preventDefault` и
  изолирует принятое событие от соседней host-поверхности. Она не должна
  блокировать обычные text/link drags или drop вне смонтированной зоны.
- Настраиваемый overlay slot и локализуемые label/hint. Доступные picker и paste
  продолжают работать независимо от drag UI.
- **Regression tests:** drag над header/thread/composer даёт одно вложение;
  соседняя host drop-zone не вызывается; drop вне чата остаётся host-приложению;
  feedback/disabled tab не принимает файл; nested dragenter/dragleave не мигает.

### CM-018 — компактные managed-attachment previews в composer

- **Обнаружено:** 2026-08-13 после подключения managed attachments 0.9.0.
- **Evidence:** `ChatAttachmentUploadList` выводит строку с маленьким preview,
  именем файла, техническим статусом и отдельным текстовым действием. Для
  нескольких визуальных референсов это занимает лишнюю высоту и не похоже на
  вложения сообщения.
- **Влияние:** пользователю сложнее сопоставить референсы, composer визуально
  перегружен, удаление не связано с конкретным изображением.
- **Временный workaround:** consumer рисует thumbnail tray из публичных
  `ChatAttachmentUploadItem.previewUrl/status/progress` и вызывает штатные
  `remove/retry`. Upload/delete/storage остаются пакетными.

#### Ожидаемое пакетное решение CM-018

- Готовый composer presentation для managed image attachments: компактные
  квадратные thumbnails, стабильная высота, имя в accessible label/tooltip и
  крестик удаления в правом верхнем углу по hover/focus (постоянно видимый на
  touch-устройствах).
- Состояния queued/uploading/failed/ready не меняют геометрию карточки:
  загрузка показывает progress, ошибка — доступный retry, удаление отменяет
  активную загрузку и очищает remote object по действующему контракту.
- После принятия submit runtime должен сразу очистить текст и composer previews,
  сохранив immutable snapshot attachment refs в optimistic user message. Очистка
  не должна ждать ответа модели; failed turn продолжает показывать вложение в
  уже отправленном пользовательском сообщении.
- Компонент принимает appearance tokens/slots и работает с `previewUrl`
  managed attachment, не требуя `dataUrl` или публичного storage URL.
- Геометрия должна быть package default, а не consumer override: верхний и
  левый край первого thumbnail совпадают с направляющими начала текста в
  textarea. При текущем package layout это означает одинаковый итоговый inset
  `18px` от внутреннего края composer (`12px` form padding + `6px` content
  inset) по block-start и inline-start. Справа применяется тот же logical inset.
- Реализовать это через единый theme token (например,
  `--cm-composer-content-inset`) либо общий внутренний layout wrapper для
  textarea, managed attachment tray и package attachment previews. Не следует
  требовать от продукта знания внутренних `12px + 6px` или копирования CSS.
- Thumbnail остаётся `72x72px`, квадратным, с package radius/border tokens.
  Несколько вложений переносятся внутри тех же левой и правой направляющих;
  добавление, удаление, upload/error state не сдвигают textarea по горизонтали.
- **Regression tests:** клавиатурное удаление и retry, touch presentation,
  максимум файлов, длинные имена, object URL cleanup, failed upload, повторная
  загрузка и отсутствие layout shift в composer. Добавить geometry regression:
  при наличии одного и нескольких thumbnails их `left` равен координате начала
  текста textarea, `top` использует тот же inset, а layout сохраняется для
  compact/regular surface, разных radius tokens и RTL.

#### Готовая инструкция агенту ChatModule для CM-018

Задача: сделать композицию managed image attachments штатной частью
`ChatComposer`, чтобы все продукты получали pixel-perfect layout без локального
CSS. Сохрани публичный upload/controller contract и реализуй presentation в
package UI/core: квадратные previews `72x72px`, package border/radius, remove по
hover/focus и доступный touch-state. В дефолтной теме выровняй верхний и левый
край thumbnail по тем же content guides, что и начало текста textarea; не
кодируй знание об Image Production. Вынеси общий inset в theme token или общий
layout wrapper, поддержи compact/regular, wrapping, RTL и переопределение темы.
Добавь component/visual regression tests на равенство координат thumbnail и
начала текста, отсутствие layout shift и все upload states. Опубликуй canary,
проверь packed consumer, затем stable release с changelog/migration note. После
consumer-проверки Image Production удалит локальный padding workaround.

### CM-019 — отдельная доставка приватного вложения AI-провайдеру

- **Обнаружено:** 2026-08-13 при анализе изображения из локального MinIO.
- **Evidence:** `ChatAttachmentApplicationService.resolveForModel()` использует
  тот же `AttachmentObjectStorage.createReadTarget()`, что и browser content
  route. Подписанный URL `minio.localhost` открывается браузером пользователя,
  но внешний AI-провайдер не может обратиться к локальной сети consumer.
- **Влияние:** корректно загруженное и провалидированное вложение завершается
  provider validation error до старта tool execution.
- **Временный workaround:** Image Production в локальном окружении использует
  отдельный model-facing application service с base64 data URL. Browser route
  продолжает получать обычный signed URL. В production флаг выключен.

#### Ожидаемое пакетное решение CM-019

- Разделить browser preview target и model delivery resolver: публичный signed
  URL, inline data URL либо provider-native upload/file ID выбирает серверный
  adapter consumer, не меняя upload/store/link lifecycle.
- Inline delivery должна иметь server-side лимит размера, MIME allowlist и не
  попадать в логи, telemetry, persistence или публичные attachment metadata.
- Provider error telemetry должна безопасно сохранять HTTP status, error code и
  correlation ID без секретов и полного payload, чтобы отличать недоступный URL,
  неподдерживаемый MIME и лимиты модели.
- **Regression tests:** private/local S3, публичный S3, истёкший signed URL,
  превышение inline-лимита, cancel и отсутствие base64 в логах.

### CM-020 — сохранение conversation после ошибки первого turn

- **Обнаружено:** 2026-08-13 при повторной проверке attachment provider error.
- **Evidence:** сервер успевает создать conversation, user message и failed turn,
  но `ChatRuntime.submit()` записывает `conversationId` только из успешного
  `ChatTurnResponse`. Error payload не содержит conversation ID, поэтому host не
  может привязать созданный диалог к документу; после reload виден welcome.
- **Ожидаемое решение:** stream protocol сообщает conversation ID до первого
  provider call либо включает его в типизированный error payload. Runtime сразу
  сохраняет ID и подключает events независимо от terminal status turn.
- **Regression tests:** ошибка provider на самом первом turn, reload/reconnect,
  retry того же turn и отсутствие второй conversation/user message.

### CM-021 — recovery первой ошибки provider tool input

- **Обнаружено:** 2026-08-13 при сборке нового image pipeline после успешного
  `node_catalog` и явного согласия пользователя.
- **Evidence:** обе provider calls завершились `success`, read tool завершился,
  но write tool не был сохранён: внутренний AJV отклонил аргументы либо модель
  вернула несколько tool calls до `proposeToolCall`. Turn получил общий
  `CHAT_AGENT_RUN_FAILED`, `executionState=ambiguous`, `retryable=false`.
- **Разрыв:** текущая bounded correction работает только после
  `CHAT_TOOL_PREPARATION_FAILED`, то есть уже после успешной package schema
  validation и вызова product `prepareTool`.

#### Ожидаемое пакетное решение CM-021

- При первой schema-validation ошибке перед `proposeToolCall` вернуть модели
  bounded список безопасных paths/codes без значений полей и дать одну или две
  конфигурируемые попытки исправить аргументы.
- Если provider вернул несколько tools, а host разрешает только один, ничего не
  исполнять и попросить модель вернуть ровно следующий одиночный call. Read и
  write tools должны выполняться последовательно.
- Суммировать usage/cost всех correction calls и соблюдать общий deadline,
  cancel, max steps, max tool calls и max cost turn. Не создавать второй user
  message/turn и не дублировать idempotency key.
- После исчерпания попыток вернуть типизированный безопасный outcome
  `CHAT_TOOL_INPUT_INVALID` с `executionState=not-started` и возможностью retry,
  а не общий ambiguous failure.
- **Regression tests:** invalid required field, unknown/extra field, malformed
  nested node/edge, parallel read+write, повторно невалидная коррекция, cancel,
  usage aggregation и отсутствие любого tool execution до валидного call.

## Новые наблюдения

Следующее замечание добавляется сюда с новым ID, датой, воспроизведением и
ожидаемым поведением. До накопления согласованного пакета этот документ является
source of truth для следующего патч-релиза ChatModule.
