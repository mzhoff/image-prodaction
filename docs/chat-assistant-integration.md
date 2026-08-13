# Chat assistant integration

Image Production использует опубликованную exact-version семью пакетов
ChatModule `0.7.0`, не копируя их исходники. Универсальный пакет отвечает за
диалог, SSE lifecycle, подтверждение действий и UI-представление. В продукте
остаются только знания Image Production, проверка Better Auth/workspace,
Drizzle persistence adapter и реализации продуктовых tools.

Замечания к внешнему модулю ведутся в
`docs/chatmodule-feedback-backlog.md`. Временные consumer-решения и условия их
удаления перечислены в `docs/chatmodule-consumer-workarounds.md`.

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

## Вертикальный сценарий: построить или улучшить пайплайн

1. Пользователь описывает задачу обычным текстом.
2. Ассистент читает знания и живой каталог нод, затем сначала показывает план.
3. Только после согласия пользователя ассистент готовит `pipeline_build` для
   нового фрагмента или `pipeline_update` для существующего графа.
4. Пользователь видит безопасное превью: ноды, настройки, связи и предупреждения
   о пропущенных несовместимых настройках.
5. Отдельное подтверждение применяет ровно показанный план одной транзакцией.
6. Canvas перечитывает документ с сервера и показывает новые ноды и связи.

`pipeline_build` в первом релизе только добавляет до 12 нод и 24 связей,
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
CHAT_ASSISTANT_PROVIDER_TIMEOUT_MS=120000
CHAT_ASSISTANT_PROVIDER_MAX_ATTEMPTS=3
CHAT_ASSISTANT_PROVIDER_RETRY_BASE_MS=750
```

Provider retry выполняется внутри исходного agent turn: по умолчанию transient
network/timeout/429/5xx получают до трёх попыток с увеличивающейся паузой.
Permanent ошибки ключа, доступа или баланса не повторяются. Это не отменяет
отдельное подтверждение write action и не запускает изменяющий граф tool второй
раз.

`CHAT_OPENROUTER_API_KEY` и `CHAT_TOOL_APPROVAL_SECRET` являются секретами. Их
нельзя добавлять в git, `NEXT_PUBLIC_*`, браузерные настройки или сообщения.
Локально они живут в `.env.local`, на сервере — в secret environment deployment.

Provider deadline сейчас равен 120 секундам, browser SDK ждёт 135 секунд. Такой
запас нужен, чтобы сервер успел зафиксировать terminal error и вернуть его до
того, как browser отменит соединение. Во время хода UI показывает elapsed timer
и только подтверждённые runtime/tool stages; скрытые рассуждения модели не
выводятся. При transient error кнопка повтора доступна лишь пока после исходного
сообщения не появился изменяющий tool call.

## Данные, миграции и rollback

`x-workspace-id` — только селектор. Сервер получает пользователя из Better Auth,
проверяет membership и назначает workspace как tenant. Document context повторно
загружается сервером; browser передаёт только id, revision, route и selection ids.

- `drizzle/0016_complex_silvermane.sql` добавляет миграции ChatModule 0.7;
- `drizzle/0017_flippant_dorian_gray.sql` добавляет product-owned proposals для
  `pipeline_build`.
- `drizzle/0018_nice_vulcan.sql` добавляет привязку document/conversation и
  product-owned proposals для `pipeline_update`.

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
