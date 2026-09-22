# Production → ChatModule: передача изменений и требования к выпуску

Дата: 22 сентября 2026. Заказчик: владелец Production / Reverie.
Назначение: передать агенту ChatModule проверяемое задание на аудит, доработку и публикацию пакетов. Визуальный дизайн в эту передачу не входит.

## 1. Что нужно получить

1. Сопоставить перечисленные ниже потребности с актуальным кодом ChatModule: `уже поставлено`, `есть локальный патч`, `нужен общий контракт`, `остаётся в продукте`.
2. Проверить и выпустить существующий патч локализации согласованной версией всего семейства. Это ближайший блокер воспроизводимой сборки Production.
3. Для следующих улучшений согласовать небольшие поставки с acceptance tests; не задерживать локализацию до реализации всего backlog.
4. Вернуть номер опубликованной версии, commit/tag, migration notes, список пакетов, результаты проверок и таблицу закрытых/оставшихся требований.
5. Production после публикации заменяет локальные архивы зависимостями из реестра и проходит свои consumer checks. Публикация пакетов сама по себе не доказывает работоспособность продукта.

Приоритеты ниже — порядок технической передачи, не изменение портфельных приоритетов. Новую глобальную архитектуру, отдельный сервис агентов, брокер или второй agent loop эта задача не заказывает.

## 2. Проверенное состояние и причина блокировки

В момент проверки Production использует 14 прямых зависимостей `@prodactionpro/chat-*` через `file:.local-packages/*-0.12.2-localization.0.tgz`. Архивы существуют локально, но исключены из Git. Чистая серверная сборка их не получит.

Проверка доступа 22.09.2026:

- `npm run packages -- check`: чтение GitHub Packages подтверждено;
- `npm run packages -- view @prodactionpro/chat-ui version`: `0.12.1`;
- запрос `@prodactionpro/chat-ui@0.12.2-localization.0`: версия не найдена;
- это не свидетельство просроченного токена: опубликованный пакет доступен тем же способом;
- секрет CI существует, но его значение здесь не читалось и отдельным новым CI install не проверялось. После выпуска обязателен registry-install в CI.

Потребляемые пакеты: `chat-application`, `chat-attachments-s3`, `chat-auth-better-auth`, `chat-connectors`, `chat-domain`, `chat-persistence-drizzle`, `chat-protocol`, `chat-runtime-core`, `chat-runtime-next`, `chat-runtime-react`, `chat-sdk`, `chat-server-core`, `chat-theme`, `chat-ui`.

Рабочие каталоги для агента на этом компьютере:

- Production: `/Users/m.pyzhov/WORKSPACEs/Development/PRODaction/image-prodaction/Repos/image-prodaction`;
- ChatModule: `/Users/m.pyzhov/WORKSPACEs/Development/PRODaction/ChatModule/repos/ChatModule`.

Далее пути `src/*`, `scripts/*`, `docs/*` без отдельного указания относятся к Production;
пути `packages/chat-*` и release-инструкции ChatModule — к репозиторию ChatModule.

Оба checkout содержат накопленные изменения. Не выполнять reset/clean и не публиковать все изменения вслепую. В ChatModule фактический текущий diff затрагивает package manifests, CHANGELOG и локализацию `chat-ui`; остальные требования ниже преимущественно реализованы как продуктовые адаптеры или записаны в backlog, а не как скрытый патч runtime-пакетов.

В документах есть отставание: `chatmodule-dependency-management.md` описывает 0.12.0, `chat-assistant-integration.md` — 0.12.1, manifest уже ссылается на локальную 0.12.2. При выпуске синхронизировать документацию с manifest/lockfile.

## 3. Граница владения

| ChatModule: общий механизм | Production: предметный контракт |
| --- | --- |
| Conversation, сообщения, SSE, Retry, attachment lifecycle | Projects, Canvas, Storyboard, Timeline, Library |
| Agent loop, ограничения, tool lifecycle, безопасное recovery | Каталог нод, Extract, правила сборки/изменения графа |
| Verified-context hooks, typed errors, prepare/confirm/execute | Проверка доступа к конкретному документу, revision/CAS |
| Типизированный интерактивный ответ и его сохранение | Смысл вариантов: формат извлечения, герои, сцены |
| Headless runtime/composer, слоты и функциональные UI-контракты | Расположение окна, Liquid Design, цвета, размеры и анимация |
| Идентификаторы вызовов, usage и hooks для атрибуции | Центральные права, ключи Workspace, тарифы и финансовые лимиты |
| Защищённая доставка вложений и extension points | HEIC-конвертер, медиапроцессинг, JSON-паспорт героя, генерации |

Не переносить в ChatModule продуктовые schemas, SQL таблицы документов, ffmpeg/libheif, CSS Production или конкретные системные промпты. Не импортировать `src/*` Production из опубликованных пакетов. Общий код разделять на contracts/core/adapters, React UI — отдельный адаптер.

## 4. Ближайший выпуск: локализация (обязательно для релиза Production)

**Статус:** локальная реализация в исходном ChatModule уже есть; проверить и опубликовать, не писать заново.

Исходники ChatModule:

- `packages/chat-ui/src/localization.tsx`;
- `packages/chat-ui/src/index.ts`;
- `packages/chat-ui/tests/localization.test.tsx`;
- изменённые компоненты `chat-composer`, `chat-module-shell`, `chat-message-item`, `chat-model-selector`, `chat-error-panel`, `chat-tool-call-panel`, `chat-activity-indicator`, attachment components, command palette, semantic block renderer.

Публичный патч предоставляет `ChatLocalizationProvider`, `useChatLocalization`, `ChatTranslator(message, params)` и locale. Production подключает его в `src/shared/i18n/package-localization.tsx` к своему переводчику.

Проверить перед выпуском:

- все собственные интерфейсные строки пакета, placeholders, tooltips, aria-labels, состояния загрузки/ошибки/пустоты, Retry/Stop/Copy/approval и отображаемые даты проходят через этот контракт;
- исходные сообщения пользователя, ответы модели, имена файлов и документы не переводятся автоматически;
- RU/EN, интерполяция, fallback неизвестного сообщения, смена locale без потери диалога, файлов и черновика;
- потребитель без provider сохраняет прежнее поведение;
- SSR/ESM imports и public declarations работают из упакованных, затем опубликованных пакетов;
- ошибка сохраняет code, retryability, trace и execution state; локализация не превращает её в новую ошибку и не запускает Retry;
- если выбран другой API ключей перевода, дать совместимость или конкретную migration guide для текущего consumer, не сломать его молча.

Семейство публикуется одной точной версией. Конкретный номер выбирает release-процесс ChatModule после проверки занятых версий. Stable-проверку Production не выключать ради tarball или prerelease. Для промежуточного canary нужен явно поддерживаемый consumer-контур; финальный релиз проходит текущую политику stable exact-version.

## 5. Интерактивный ответ: один выбор → продолжение действия (P1, CM-027)

**Текущий факт:** transport `selectedAction` уже исправлен в опубликованном 0.12.1. Не повторять этот fix. В Production ещё живут собственные вопросы, карточки и проверка их происхождения.

Сценарий: пользователь просит создать Extract по приложенному изображению. Агент уточняет формат: «Одним блоком» / «По разделам». Клик отправляет ответ в тот же разговор вместе с типизированным payload. На следующем ходе агент готовит конкретный `pipeline_build`/`pipeline_update` с исходным изображением и задачей; не спрашивает то же самое снова. Подтверждение изменения графа остаётся отдельным штатным preview/approval.

Нужен общий lifecycle:

- стабильные `interactionId`, schema/version, `single-choice`/`multi-choice`, options с description и bounded host payload, custom input, min/max, recommended/default;
- default choice — только подсказка, не автоматическая отправка;
- состояния open/submitting/submitted/expired/error, результат и выбор восстанавливаются после reload;
- сервер проверяет принадлежность вопроса conversation/user/workspace, источник и актуальность; клиентский payload не считается разрешением;
- повторный клик/повтор доставки идемпотентен, просроченный вопрос не продолжает другую задачу;
- ответ сохраняется в `selectedAction` и как понятный user-role текст для модели; Retry сохраняет исходный lineage;
- клик ответа не отправляет и не уничтожает самостоятельный черновик/attachments в composer;
- универсальный renderer + headless API, keyboard/focus/validation; внешний вид настраивается хостом;
- продукт может задать политику «после этого уточнения выполнить следующий шаг»; не зашивать Extract или требование всегда двух вариантов в core.

Production предпочитает два понятных варианта и свой ответ; существующий Extract continuation пока проверяет именно индекс и label предложенного варианта. Custom input и multi-select нужно проверить отдельно, а не объявить покрытыми этим частным кейсом.

Доказательства: `src/modules/chat-assistant/contracts/assistant-question.ts`, `server/assistant-question-tool.ts`, `src/shared/assistant/model/{assistant-question,use-assistant-answer}.ts`, `src/features/chat-assistant/model/assistant-questions.ts`, `server/design-element-selection-service.ts`. Legacy Extract regex — узкая совместимость старых сообщений, не контракт для новых вопросов.

Проверки: `assistant-question-tool.test.ts`, `assistant-questions.test.ts`, `design-selection-continuation.test.ts`; дополнить duplicate submit, custom input, reload, expired/cross-conversation, сохранение composer draft, один preview после ответа.

## 6. Harness: безопасное восстановление и бюджет выполнения (P1/P2)

Здесь harness означает обвязку agent loop: контекст, инструменты, проверки, лимиты, ошибки, события и учёт вызовов. Production использует `ToolCallingChatAgent`, а не второй собственный agent loop.

Актуальный `server/composition.ts` задаёт `toolCallRecovery.maxAttempts = 2`, `multipleCalls = request-single`, `maxSteps = maxToolCalls + 1`. Текущие defaults в `server/config.ts`: 6 tools/turn, 3600 output tokens, deadline 75 секунд, cost guard $0.01. Значения конфигурируемые; не переносить их как универсальные package defaults. Старое описание 3 tools / 1200 tokens устарело.

### 6.1 CM-021: понятный product preflight failure

Общий контракт безопасной ошибки подготовки действия: code/category, retryability, bounded field paths и безопасная причина исправления. Агент может исправить вход и повторить prepare внутри общего recovery budget. Raw provider response, credentials, payload и stack не попадают пользователю/модели.

Проверить, какая часть уже поставлена; не заменять все ошибки общей строкой `CHAT_TOOL_PREPARATION_FAILED`. Auth/access/неоднозначное выполнение write не превращать в автоматический retry.

### 6.2 CM-024: диагностика invalid tool input

Production логирует безопасную диагностику в `server/tool-input-diagnostics.ts` через `LimitedOpenRouterGateway`. Нужен общий diagnostic hook: tool name, schema path, reason code, попытка и correlation ID, без значений пользовательских полей. После исчерпания budget — одна объяснимая terminal error, а не бесконечная коррекция.

### 6.3 CM-025: повторные read-tools

Повторяющиеся одинаковые чтения расходуют контекст и steps. Предложить ограниченную дедупликацию только явно cacheable read-tools в пределах turn и verified revision; сбрасывать при изменении контекста или write. Никогда не дедуплицировать paid/write операции по одному похожему prompt.

### 6.4 CM-026 / CW-012: revision drift во время turn

Autosave меняет revision между проверкой контекста и prepare. Нужен typed `context-stale` outcome и один bounded re-resolve через host verifier; затем один актуальный preview. Повторный conflict завершает попытку. Revoked membership и `unsaved:*` остаются fail-closed.

Сейчас Production перечитывает текущую server revision для preview, а confirm сверяет concurrency token/CAS. Не удалять этот механизм до package delivery и consumer-теста. Refresh контекста не является разрешением записи и не должен повторять уже оплаченный запрос без оценки состояния.

Проверки: stale→refresh→preview, повторный conflict, revoke, unsaved, malformed/parallel calls, одинаковые read-tools, отмена/deadline, отсутствие дублей message/approval/usage/execution. Подробные требования уже описаны в `docs/chatmodule-feedback-backlog.md`, разделы CM-021/024/025/026.

## 7. Один runtime на всех поверхностях, сохранение контекста (P1 audit)

Production имеет Home, Canvas, Blueprint, паспорт героя и Timeline. В `src/shared/assistant` общие `AssistantChat`, `AssistantComposer`, `AssistantWindow`, `useAssistantRuntime`, `useAssistantConversation`, `useAssistantAnswer`; они оборачивают package API. Переход fullscreen → боковой соавтор должен сохранять conversation, сообщения, модель, черновик, attachments и исполняющийся turn.

Проверить покрытие публичными API и предложить только недостающие общие hooks:

- controlled surface/portal без нового conversation или provider call;
- явный focus-only keyboard contract (уже поставлен в 0.12.0);
- lazy conversation: открытие/сворачивание окна, смена режима и добавление файла сами не создают пустые чаты;
- стабильный start idempotency key и восстановление того же conversation при первом failed turn;
- одновременное открытие документа в двух вкладках не создаёт две конкурирующие привязки;
- смена user/workspace не переиспользует чужой cache, очередь файлов или контекст;
- изменение модели управляется host allowlist и сохраняется; UI не разрешает неподдерживаемую modality;
- host selectors при каждом turn/Retry проходят server verification. URL и данные браузера не являются правами.

Источники: `server/conversation-start-route.ts`, `server/document-conversation-service.ts`, `server/home-conversation-service.ts`, `server/verified-context.ts`, `adapters/client/conversation-start.ts`, общий runtime hook. Готовые Canvas resize/drag/blur стили переносить не нужно; изоляция canvas wheel/pan остаётся CW-006 product-specific.

Проверки: `conversation-start.test.ts`, `conversation-lifecycle.postgres.test.ts`, `retry-verified-context.test.ts`, `timeline-conversation.test.ts`; UI-переход без remount потери state и случайной отправки.

## 8. Вложения: preprocessing, progress и delivery (P1 audit)

Package managed attachments, drop-zone, thumbnails, optimistic snapshots и protected model delivery уже существуют с 0.11/0.12. Не возвращать удалённые локальные реализации этих механизмов.

Production добавил продуктовый `useProductionAttachments`:

- немедленное место файла в очереди, HEIC preprocessing через сервер, затем штатный upload/validation/preview;
- MIME-normalization для HEIC с пустым MIME, общий приём picker/drop/paste;
- lock очереди на submit, в том числе callbacks до React rerender;
- очередь принадлежит Workspace, при смене Workspace требуется remount;
- ошибки файла остаются доступны для retry, не исчезая без результата.

Запрос upstream: проверить, можно ли убрать wrapper locks через публичную транзакцию submit и общий preprocessing lifecycle. Нужны AbortSignal/cancel, последовательность preprocessing→upload→validation→ready, stage progress без выдуманных процентов, сохранение original filename, безопасная замена preview и batch partial failures. При нехватке этих гарантий — расширить контракт без добавления HEIC-кодека в core.

Продуктовые проверки содержимого: `server/composer-attachment-delivery.ts`. UTF-8 TXT/MD/CSV/JSON до 20000 символов передаются как пользовательский материал; byte length/checksum/MIME проверяются. Видео/аудио сохраняются, но текущая модель получает только уведомление о наличии файла. **Нельзя считать, что загрузка медиа уже означает понимание его моделью.** PDF/DOCX в этом продуктовом сценарии не включены.

Provider-independent attachment capability/delivery можно развивать в пакете; транскрипцию, извлечение кадров и платные preprocessing jobs запускать только через явные host tools/policies.

Для внешнего S3 подтвердить public contracts: отдельные upload/browser/model targets, private bucket, presigned URL expiry, CORS, immutable sealing, lifecycle cleanup незавершённых загрузок. Проверить с новым Timeweb bucket после подключения; текущий аудит этого не доказывает.

Проверки: `composer-attachment-delivery.test.ts`, `chat-attachment-asset-bridge.test.ts`, UI HEIC cancel/retry, multi-file partial error, submit during upload, workspace switch, sealed bytes и отсутствие signed URL в durable message/logs.

## 9. Usage и долгие продуктовые задания (P1 audit)

Production показывает расходы **документа за всю его жизнь**, включая AI-ассистента; закрытие и повторное открытие Canvas не обнуляет итог. Сейчас `src/modules/usage/server/usage-calls-sql.ts` объединяет generation usage с `chat_llm_calls` через conversation/document binding.

Нужен согласованный package контракт корреляции: product/tenant/user, conversation, originating request, turn, physical model call/attempt, tool call и host-owned subject/document reference. Проверить существующие поля прежде добавления новых. Document/asset IDs — opaque для ChatModule, права проверяет host.

Каждый реально оплаченный вызов, включая recovery/retry, учитывается один раз; переподключение SSE не дублирует расход. Неизвестная стоимость не равна нулю, позднее уточнение корректирует исходную запись. Отдельная классификация assistant/text/image/video/audio принадлежит продуктовой аналитике, не CSS пакета.

Проверить полноту учёта внутренних попыток провайдера: вызов `completeWithTools` может включать retry внутри connector. Наличие одной записи turn ещё не доказывает учёт всех физических попыток. Postfactum cost guard не равен резервированию денег до операции; финансовый admission/лимиты Workspace остаются у платформы/host.

Генерации выполняются durable jobs Production. ChatModule должен принимать идемпотентные status/result events с job linkage, сохранять их и корректно восстанавливать после reload/reconnect; не выдавать «принято в очередь» за «готово». Stop разговора и cancel внешнего job — разные действия с явным host contract.

Источники: `server/document-activity-chat-adapter.ts`, `server/document-activity-identity.ts`, `server/home-generation-service.ts`, `server/workspace-provider.ts`, `server/limited-openrouter-gateway.ts`. Не переносить worker/orchestrator Production в ChatModule.

## 10. Именование и организация разговоров (P2)

Production уже хранит собственную организацию в `production_chat`: название/источник, архив, корзина, папка. «В проект с материалами» меняет связи, а не копирует бинарные файлы. Архив/корзина блокируют новые turns до восстановления; данные документов и usage не удаляются.

`server/production-chat-title.ts` оборачивает обычный учитываемый model call: извлекает служебный title, удаляет его из видимого ответа и условно сохраняет, не перетирая ручное название. Отдельного платного вызова нет.

Upstream: оценить универсальные title hooks/structured metadata и host lifecycle guard вместо ручного парсинга служебного тега. Безопасный fallback — начальное намерение пользователя; race с ручным rename всегда выигрывает пользователь. Ошибка сохранения title не должна повторять платную генерацию. Folders, перенос артефактов, sidebar cache и права на документ остаются в Production.

Проверки: `production-chat-title.test.ts`, `production-chat-service.postgres.test.ts`, `production-chats-cache.test.ts`; два одновременных start, rename во время ответа, архив во время turn, одинаковая структура после reload.

## 11. Stories / герои / Timeline: требования к extension API (P1 audit)

Stories используют тот же conversation/runtime, но другой verified context и system prompt. JSON-паспорт героя — один источник для агента, ручного редактирования, читаемого описания и image prompt. Ручные и агентные изменения защищены revision. Генерация образа — отдельная явная операция; правка текста паспорта не запускает её автоматически.

После уточнения агент готовит blueprint через product tool, затем предлагает подготовить героев. Карточка вопроса/действия использует общий interaction lifecycle. Выбранный герой передаётся как opaque focused entity selector и проверяется сервером. Несохранённая ручная правка не перетирается молча.

Timeline — отдельный документ, может существовать без истории. Его assistant tools, монтаж, audio linkage, undo и durable export остаются продуктовыми. Общему пакету нужны расширяемые context/tool/result slots и сохранение связности разговора, а не знание устройства таймлайна.

Источники: `server/story-conversation.ts`, `server/story-authoring-tools.ts`, `server/timeline-conversation.ts`, `core/story-system-prompt.ts`, `core/timeline-system-prompt.ts`, `docs/story-character-passports.md`, `docs/stories-authoring-adr.md`.

Проверки: смена focused character, concurrent manual/agent edit, единичное применение approved action, replay результата без повторной записи, восстановление чата документа, cross-workspace rejection.

## 12. Что уже поставлено и что отложить

Не объявлять заново отсутствующим:

- CM-022 / CW-011: focus-only keyboard policy — поставлено в 0.12.0;
- CM-023 / CW-015: Retry selectors + server revalidation — поставлено в 0.12.0;
- CM-028 / CW-014: tool lifecycle в основном SSE до terminal — поставлено в 0.12.0;
- `selectedAction` в model context/persistence/Retry — исправлено в 0.12.1;
- managed upload/drop-zone/model-delivery/первый failed turn — уже публичные API.

Эти контракты требуют regression tests при выпуске, но не новой альтернативной реализации.

Существующие крупные направления CM-007 (Assistant Quality/evaluation) и CM-008 (versioned Knowledge Base) сохранить отдельными инициативами. Для них есть детальные требования в feedback backlog. Не включать их как обязательное условие срочной публикации локализации. CW-007 (чтение product Markdown) удаляется только после проверенного подключения KB adapters; исходную документацию заранее не удалять.

## 13. Порядок поставки и приёмка

### Выпуск A: существующий localization patch

1. Проверить текущий diff ChatModule и отсутствие неучтённых чужих изменений.
2. Пройти package lint/typecheck/tests/build и cold packed-package SSR/ESM/consumer проверки по актуальному `docs/release.md` ChatModule. Проверить актуальность security audit exceptions, не продлевать их молча.
3. Опубликовать полную совместимую семью; повторное чтение каждой версии из registry обязательно.
4. Дать Production migration notes. Заменить все 14 `file:` dependencies одной точной stable версией, обновить lockfile без вложенных старых копий.
5. Проверить чистую registry-install в CI без локальных `.tgz`, затем проверки ниже. Другие локальные пакеты UI/Identity — отдельные release dependencies, публикация ChatModule не закрывает их автоматически.

### Выпуск B: interaction lifecycle и reliability

Начать с CM-027 и CM-026/021/024; для каждого — contract, пакетные тесты, canary consumer test, stable release, удаление только заменённого workaround. CM-025 и title/lifecycle hooks — отдельные небольшие поставки по результату аудита. Новые API нельзя считать согласованными только по этой записке: агент должен предъявить контракт и совместимость.

### Consumer checks Production

- `npm run packages -- check`;
- `npm run check:chatmodule-versions`;
- `npm run typecheck`, `npm run lint`, `npm run check:architecture`;
- focused tests упомянутых файлов через существующий `scripts/node-test-loader.mjs`;
- `npm run test:chat-pipeline-action-smoke` в изолированной тестовой БД после схемы;
- реальная cold install/build CI и browser smoke RU/EN на Home, Canvas, Blueprint, герое, Timeline;
- вопрос→клик→preview→одно подтверждение→изменение документа;
- HEIC preprocessing, attachment delivery, отказ доступа, reconnect/Retry, сохранение model/draft, сверка usage после повторного открытия документа.

Не гонять DB-mutating smoke по пользовательской/production базе. Не называть mock-тест реальной проверкой OpenRouter/Timeweb или paid generation. Отдельно указать что проверено: unit, integration, database, browser, live provider, published install.

### Ожидаемый ответ агента ChatModule

| Требование / CM ID | Уже есть / сделано / отложено / host-owned | Публичный API | Тест и результат | Версия | Workaround к удалению |
| --- | --- | --- | --- | --- | --- |
| … | … | … | … | … | … |

Приложить commit/tag, список опубликованных пакетов, migration notes, changelog, известные ограничения и конкретные действия consumer. Не закрывать весь документ формулировкой «пакеты опубликованы», если часть новых контрактов остаётся backlog.

## 14. Связанные документы Production

- [Направление платформы](./platform-integration-direction.md)
- [Feedback backlog с CM IDs](./chatmodule-feedback-backlog.md)
- [Ledger обходов CW](./chatmodule-consumer-workarounds.md)
- [Интеграция чата](./chat-assistant-integration.md)
- [Чаты и референсы](./production-chats-and-references.md)
- [Home assistant](./home-assistant-experience.md)
- [Герои и паспорт](./story-character-passports.md)
- [Stories ADR](./stories-authoring-adr.md)
- [Политика зависимостей](./chatmodule-dependency-management.md)

Эта передача создана по чтению исходников/документов и registry probes 22.09.2026. Новые изменения ChatModule и полный consumer suite в рамках подготовки документа не выполнялись. Старые записи `consumer-verified` — исторические результаты, а не утверждение о повторном прогоне сегодня.
