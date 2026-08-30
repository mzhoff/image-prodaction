# Chat assistant integration

Image Production использует опубликованную exact-version семью пакетов
ChatModule `0.12.0`, не копируя их исходники. Универсальный пакет отвечает за
диалог, SSE lifecycle, подтверждение действий, managed image attachments и
UI-представление. В продукте остаются только знания Image Production, проверка
Better Auth/workspace, Drizzle persistence adapter и реализации продуктовых
tools.

Замечания к внешнему модулю ведутся в
`docs/chatmodule-feedback-backlog.md`. Временные consumer-решения и условия их
удаления перечислены в `docs/chatmodule-consumer-workarounds.md`.

## Гарантии интеграции 0.12.0

- Composer работает с явной `composerKeyboardPolicy="focused"`: печать и
  shortcuts обрабатываются только внутри активной поверхности composer. Режим
  global typing не включается скрытым host-кодом.
- Штатный Retry восстанавливает текст, attachments и сохранённые
  `contextSelectors` исходного user message. Каждый повтор снова вызывает
  host-owned `verifiedContextResolver`; membership, workspace, document и
  revision остаются server-authoritative, а browser selectors не становятся
  разрешением на действие.
- События tool lifecycle передаются через основной turn SSE до terminal event.
  Consumer использует обычный `RestSseChatClient` и не перечитывает conversation
  по REST для восстановления завершённой карточки.

CM-026 остаётся отдельным открытым контрактом: он описывает revision drift
внутри уже выполняющегося model turn, а не восстановление контекста отдельным
Retry. Поэтому product-owned подготовка preview по актуальной server revision и
защита подтверждения concurrency token сохраняются как CW-012.

## Режимы ассистента

- `knowledge-base` отвечает на вопросы по продукту и каталогу нод;
- `product-copilot` дополнительно помогает спроектировать пайплайн;
- модель по умолчанию — `openai/gpt-5.4-nano`;
- серверные лимиты: 1 200 output tokens, 3 tool calls и 4 шага на turn;
- постфактум cost guard — `$0.01` на turn;
- rate limit — 20 turns в минуту на пользователя и workspace;
- история, LLM usage и tool audit сохраняются в PostgreSQL.

Для каждого документа и пользователя продукт хранит одну активную привязку к
conversation. Повторное открытие pipeline, reload страницы и перезапуск web
восстанавливают тот же диалог. Для разговоров, созданных до этой привязки,
сервер один раз находит последнюю беседу по проверенному document context и
закрепляет её; разные старые conversations автоматически не склеиваются.

При открытии нового пустого документа панель ассистента открывается один раз и
показывает стартовый вопрос. Закрытие панели пользователем уважается: повторно
в рамках той же страницы она сама не открывается.

## Ask AI для ноды

Пункт `Ask AI` доступен в контекстном меню каждого зарегистрированного типа
ноды, включая `banner` и сохранённый в старом документе
`referenceComposer`. Он использует штатный `ChatLauncher` ChatModule 0.12 с
режимом `delivery: "draft"`: открывает именно вкладку Assistant и вставляет в
composer вопрос с каноническими label и type, но не отправляет сообщение.
Ответ появится только после явной отправки пользователем.

Если ассистент уже отвечает, в composer есть другой черновик или подготовлено
вложение, Ask AI открывает чат, но ничего не перезаписывает. В текст вопроса не
попадают ID, settings или содержимое выбранной карточки; серверные права и
document context продолжают проверяться обычным путём. Вопрос просит только
объяснение и запрещает менять текущий документ, а серверный system prompt
направляет модель в read-only `node_catalog`.

Product-owned описания, возможности, ограничения и правила портов хранятся в
типизированном `NODE_HELP_METADATA` для 30/30 типов. Полный тестовый индекс и
единый шаблон вопроса находятся в
[`assistant-knowledge/node-catalog.md`](./assistant-knowledge/node-catalog.md).

## Вертикальный сценарий: построить или улучшить пайплайн

1. Пользователь описывает задачу обычным текстом.
2. Ассистент читает знания и живой каталог нод. Если запрос уже содержит прямую
   команду и достаточный контекст, он без дополнительного текстового согласования
   сразу готовит proposal. Один простой вопрос допустим только при принципиально
   неоднозначном намерении.
3. Для макета по референсу product-owned `design_element_selection` может
   показать найденные объекты, рекомендуемые defaults и checkbox-выбор. Этот
   read-only шаг передаёт требования и не изменяет canvas. Структурированный
   результат сохраняет выбранные `selectedElements` и их опциональный
   нормализованный `referenceFrame`, поэтому первый layout не требует повторно
   угадывать или спрашивать координаты.
4. Ассистент готовит `pipeline_build` для нового фрагмента или
   `pipeline_update` для существующего графа.
5. Пользователь видит безопасное превью: ноды, настройки, связи и предупреждения
   о пропущенных несовместимых настройках.
6. Единственное подтверждение action preview применяет ровно показанный план
   одной транзакцией.
7. Canvas перечитывает документ с сервера и показывает новые ноды и связи.

`pipeline_build` добавляет до 24 нод,
настраивает небольшой разрешённый набор полей и детерминированно рассчитывает
координаты по топологии: входы находятся слева, последовательные этапы обработки
занимают центральные колонки, конечные результаты находятся справа. Параллельные
ветви одного уровня располагаются вертикально, а одиночные промежуточные ноды
центрируются относительно самой высокой колонки. Он не запускает, не публикует,
не экспортирует, не удаляет и не изменяет существующие ноды.

Перед изменением существующего pipeline ассистент обязан вызвать read-only
`document_graph`: сервер возвращает ограниченную проекцию реальных node/edge id,
портов, координат и разрешённых настроек. Затем `pipeline_update` может добавить
ноды, изменить allowlisted-настройки существующих нод, удалить указанные связи и
добавить новые. При изменении связей продукт перераскладывает всю затронутую
связную цепочку, включая прежние ноды, но сохраняет положение других независимых
графов на том же canvas. Preview и подтверждение используют тот же server-owned
`prepare -> confirm -> execute`, что и первоначальная сборка.

Для редактируемых макетов ассистент использует `compositionBlueprints` —
высокоуровневый контракт с semantic key, source, role, normalized frame,
z-index и style. Product compiler сам назначает `layer-N`, проверяет типы
портов, создаёт edges, переводит рамку в пиксели и возвращает ошибку с точным
путём к полю. QR описывается как обычный image-слой с role `qr`; одна
Composition поддерживает до 24 слоёв. Полный контракт и граница будущего
серверного runtime зафиксированы в
[`composition-blueprint-contract.md`](./composition-blueprint-contract.md).

`textConcat` присутствует в живом каталоге. Для раздельно редактируемых заметок,
правил и стиля используются несколько `textPrompt`, входы `text-0`, `text-1`,
`text-2` и далее, после чего `textConcat.result` подключается к
`textGeneration.text`. Количество входов увеличивается сервером по фактически
проверенным связям; разделитель, prefix и suffix доступны только через
allowlisted settings.

Каждый новый plan задаёт короткий `documentName`. При выполнении action продукт
заменяет им только исходное `Untitled Pipeline`, но не перезаписывает название,
которое пользователь уже изменил сам. Данные, меняющиеся между запусками
(заметки, тема, бриф, исходный текст), оформляются отдельными `textPrompt`-нодами
и подключаются к потребителю. Стабильные правила, структура и тон остаются в
`instruction`; подставлять туда будущий пользовательский ввод нельзя.

## Изображения и референсы

Пользователь может добавить до трёх JPEG, PNG или WebP изображений через выбор
файла, drag-and-drop или вставку из буфера, а затем отправить их вместе с
текстовым комментарием. Browser оптимизирует изображение до 2 048 px и 6 MB,
но окончательные ограничения и проверка сигнатуры принадлежат серверу. Объект
хранится в private S3/MinIO, а в сообщении сохраняется только управляемая ссылка
`attachmentId`; временный signed URL не попадает в историю.

В model context передаётся максимум шесть изображений. Ассистент анализирует
только видимые признаки и структурирует ответ по продуктовой семантике:
actors/subjects, actions/pose/state, composition, camera, background,
style, light, color, metaphor/meaning и text/typography. Неуверенные или
нечитаемые детали он обязан помечать, а не выдумывать.

Если референс нужен на canvas, `pipeline_build` или `pipeline_update` указывает
его порядковый `sourceAttachmentIndex` только для `importImage`. До
подтверждения это остаётся декларативной ссылкой. При execute сервер повторно
проверяет владельца, скачивает private attachment, создаёт обычный долговечный
asset документа и назначает его Import-ноде. Повтор использует уже созданный
asset и не дублирует файл.

## Почему действие безопасно

- browser не получает OpenRouter key и не решает, к какому workspace относится
  документ;
- сервер повторно проверяет пользователя, membership, документ и revision;
- несохранённое или уже изменившееся состояние canvas блокирует подготовку;
- в базе сохраняется точный patch, а подтверждение принимает только непрозрачный
  `executionRef`, а не новый произвольный JSON от browser;
- предложение привязано к user/workspace/document/tool/idempotency key и живёт
  10 минут;
- повторное подтверждение не дублирует ноды и возвращает прежний результат;
- изменение document revision между preview и confirm даёт безопасный conflict;
- ошибки для browser обезличены, а секреты и raw provider payload не попадают в
  сообщения или tool result.

## Переменные окружения

```dotenv
CHAT_ASSISTANT_ENABLED=true
CHAT_ASSISTANT_MODEL=openai/gpt-5.4-nano
CHAT_OPENROUTER_API_KEY=
CHAT_TOOL_APPROVAL_SECRET=
CHAT_ASSISTANT_MAX_OUTPUT_TOKENS=1200
CHAT_ASSISTANT_MAX_COST_USD_PER_TURN=0.01
CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN=6
CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS=60000
CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS=3
CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS=750
CHAT_ASSISTANT_PROVIDER_RETRY_DEADLINE_MS=70000
CHAT_ASSISTANT_SERVER_TURN_DEADLINE_MS=75000
CHAT_ATTACHMENT_S3_ENDPOINT=http://minio.localhost:9000
CHAT_ATTACHMENT_S3_KEY_PREFIX=chat-attachments
CHAT_ATTACHMENT_MAX_BYTES=8388608
CHAT_ATTACHMENT_MAX_COUNT=3
CHAT_ATTACHMENT_MAX_CONTEXT_IMAGES=6
CHAT_ATTACHMENT_MODEL_DELIVERY=remote-url
CHAT_ATTACHMENT_UPLOAD_TTL_SECONDS=900
CHAT_ATTACHMENT_READ_TTL_SECONDS=900
```

`CHAT_ATTACHMENT_MODEL_DELIVERY=inline-bytes` используется только там, где
внешний AI-провайдер не может прочитать private signed URL (например, локальный
MinIO). Ограничение размера и чтение байтов выполняет штатный server-side
resolver ChatModule; base64 не сохраняется в истории и не передаётся browser.
В доступном провайдеру окружении остаётся более экономичный `remote-url`.

Provider retry выполняется внутри исходного agent turn: по умолчанию transient
network/timeout/429/5xx получают до трёх попыток с увеличивающейся паузой.
Permanent ошибки ключа, доступа или баланса не повторяются. Это не отменяет
отдельное подтверждение write action и не запускает изменяющий граф tool второй
раз.

`CHAT_OPENROUTER_API_KEY` и `CHAT_TOOL_APPROVAL_SECRET` являются секретами. Их
нельзя добавлять в git, `NEXT_PUBLIC_*`, браузерные настройки или сообщения.
Локально они живут в `.env.local`, на сервере — в secret environment deployment.

Одна provider-попытка ограничена 60 секундами, вся серия provider retry — 70,
server turn — 75, browser SDK — 90. Порядок `provider < server < SDK` оставляет
серверу время записать terminal outcome до отмены browser. Во время хода пакет
показывает сохранённый backend-driven progress и elapsed timer, но не раскрывает
скрытое reasoning. Штатный retry доступен только для `not-started` и
`read-only`; неоднозначное или уже изменившее данные действие автоматически не
повторяется.

## Данные, миграции и rollback

`x-workspace-id` — только селектор. Сервер получает пользователя из Better Auth,
проверяет membership и назначает workspace как tenant. Document context повторно
загружается сервером; browser передаёт только id, revision, route и selection ids.

- `drizzle/0016_complex_silvermane.sql` добавляет миграции ChatModule 0.7;
- `drizzle/0017_flippant_dorian_gray.sql` добавляет product-owned proposals для
  `pipeline_build`.
- `drizzle/0018_nice_vulcan.sql` добавляет привязку document/conversation и
  product-owned proposals для `pipeline_update`.
- `drizzle/0019_damp_wiccan.sql` добавляет ChatModule 0.8 lifecycle events,
  structured error state и retry lineage без перезаписи существующей истории.
- `drizzle/0020_motionless_pretty_boy.sql` добавляет ChatModule 0.9 managed
  attachments и связи вложений с сообщениями.
- `drizzle/0021_sloppy_crusher_hogan.sql` добавляет ChatModule 0.10/0.11 support
  persistence и durable conversation events для восстановления SSE между
  несколькими web-процессами и после reconnect.

ChatModule 0.12.0 не требует новой consumer-миграции: обновление использует уже
применённую схему `0021`, а изменённые keyboard, Retry и turn-stream контракты
проверяются на уровне установленной exact-version семьи и runtime.

Все миграции запускаются обычной командой продукта `npm run db:migrate`.
ChatModule не применяет миграции автоматически. Для быстрого отключения следует
установить `CHAT_ASSISTANT_ENABLED=false` и перезапустить web; история чата и
документы при этом не удаляются.

## Знания и следующие этапы

До поставки CM-008 знания редактируются Pull Request в
`docs/assistant-knowledge`. После появления коробочной Knowledge Base они должны
быть импортированы в versioned collection, а файловый loader удалён по
consumer-workaround ledger.

Следующие product tools добавляются отдельными вертикальными сценариями с тем же
циклом `plan -> preview -> confirm -> execute`: запуск, сохранение версии,
export и publish. Полномочия каждого tool должны быть
минимальными; один универсальный `execute_anything` запрещён.

## Проверка consumer

```bash
npm run check:chatmodule-versions
npm run typecheck
npm run lint
npm run check:architecture
npm run check:size
npm test
npm run build
npm run db:check
npm run test:chat-pipeline-action-smoke
```

Smoke test создаёт отдельный временный документ, проверяет build/update
prepare/confirm, повторное подтверждение и revision conflict, затем удаляет
только этот тестовый документ.
