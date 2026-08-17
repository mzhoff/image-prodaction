# ChatModule consumer workaround retirement ledger

Документ хранит только актуальные временные обходы Image Production и
продуктовые границы, которые важно не перепутать с универсальным ChatModule.
История уже удалённых обходов остаётся в Git.

## Состояние после перехода на ChatModule 0.9.0

| ID | Связь | Статус | Текущее решение |
| --- | --- | --- | --- |
| CW-006 | canvas integration | `keep-product-specific` | Host блокирует передачу wheel/pan события из панели чата в React Flow canvas. |
| CW-007 | CM-008 | `active` | Knowledge Base пока читается из product-owned Markdown. |
| CW-008 | CM-017 / CM-018 | `active` | Host временно перехватывает file drop всей панелью и рисует thumbnail tray поверх публичного attachment controller. |
| CW-009 | CM-019 | `active` | Локальные приватные изображения передаются модели inline, потому что внешний provider не видит MinIO consumer. |
| CW-010 | CM-021 | `active` | Product gateway ограниченно исправляет invalid/parallel tool calls и ошибки product preflight до package execution, чтобы согласованный turn не падал общей ошибкой. |

ChatModule 0.9.0 сохраняет package-owned решения версии 0.8.0 и дополнительно
поставляет managed attachments: picker, paste, drop, upload lifecycle, private
preview и server-owned S3 contract. Прежние package-owned решения включают:

- product-action prepare recovery и одной ограниченной коррекции модели;
- backend-driven progress, heartbeat и server elapsed time;
- структурированных ошибок и идемпотентного безопасного retry;
- CSS activity indicator;
- единственной актуальной confirmation/tool-call карточки;
- bounded OpenRouter retry с общим deadline, cancel и `Retry-After`.

Локальные реализации этих функций удалены. Consumer использует штатные
`activity`, `errorDetails`, `retryLastTurn`, retry-stream route и
`OpenRouterClient.retryPolicy` из версии `0.9.0`. Связывание chat attachment с
долговечным asset и Import-нодой остаётся продуктовой интеграцией Image
Production, а не обходом универсального пакета.

## CW-006 — canvas wheel boundary остаётся продуктовым

`AssistantShell` помечает overlay через `data-canvas-wheel-block`, а
Image Production не передаёт wheel/pan событие canvas, если курсор находится
над панелью. Только host знает, что под чатом находится масштабируемый граф.

Проверка: колесо/трекпад над чатом прокручивает историю, над canvas — canvas;
достижение края истории не прокручивает подложку.

## CW-007 — файловая Knowledge Base остаётся временной

Сейчас `knowledge-base.ts` читает фиксированный набор файлов из
`docs/assistant-knowledge`, а Dockerfile переносит Markdown в runtime image.
После поставки CM-008 нужно:

1. Подключить опубликованные storage/search/auth adapters и миграции.
2. Импортировать Markdown в draft versioned collection.
3. Проверить tenant isolation, citations, publish, rollback и reindex.
4. Переключить agent retrieval на опубликованный snapshot.
5. После rollback-окна удалить файловый loader и Docker COPY.

Исходные документы нельзя удалять до подтверждённого переключения.

## CW-008 — временное представление и drop boundary вложений

`AssistantShell` на capture-фазе принимает file drag во всей открытой вкладке
Assistant, показывает overlay и вызывает публичный
`useChatAttachments().addFiles`. Это не даёт событию одновременно попасть в
canvas drop handler. `ImageProductionChat` временно визуализирует публичные
upload items компактными previews с hover/focus-кнопкой удаления и retry.
Tray также добавляет локальный `6px` content inset сверху и по бокам, чтобы
thumbnail совпадал с направляющими textarea. Этот pixel-perfect padding нужно
удалить вместе с остальным CW-008 после package presentation CM-018.

Удалить CW-008 можно только после публикации CM-017 и CM-018, когда package:

1. Поставляет headless drop-zone API для произвольной host-оболочки и активный
   overlay state.
2. Поставляет managed thumbnail presentation для composer с remove/progress/
   failure/retry и доступностью с клавиатуры и touch.
3. Проверен в Image Production: один drop над чатом создаёт ровно одно
   attachment, над canvas — ровно одну Import-ноду, а превью не теряет upload
   lifecycle и private storage contract.

До этого запрещено редактировать `node_modules`: workaround использует только
публичные API пакета и удаляется целиком после consumer-проверки новой версии.

## CW-009 — inline read target для локального приватного storage

При `CHAT_ATTACHMENT_INLINE_READ_TARGETS=true` consumer создаёт отдельный
model-facing application service поверх обёрнутого штатного S3 adapter. Upload,
browser preview, validation, ownership, persistence и delete остаются на обычном
signed URL service; только модель получает ограниченный по размеру base64 data
URL. Флаг включён лишь в локальном Docker, где `minio.localhost` недоступен
внешнему OpenRouter.

Удалить CW-009 нужно после поставки CM-019: отдельного model delivery resolver,
который не связывает browser preview URL со способом передачи изображения
провайдеру. До этого запрещено включать workaround по умолчанию в production.

## CW-010 — bounded correction до package tool validation

ChatModule 0.9.0 умеет один раз исправлять ошибку product-owned `prepareTool`,
но первая ошибка provider tool input, отклонённая внутренним AJV до
`prepareTool`, завершает весь turn общим `CHAT_AGENT_RUN_FAILED`. То же
происходит, если модель вернула read и write tools параллельно. Image Production
временно проверяет собственные `pipeline_build`/`pipeline_update` схемы на
provider boundary. Для `pipeline_build` там же без записи запускается чистый
product compiler preflight: он ловит нормализованные несовместимые порты,
несколько связей в один input и другие детерминированные ошибки графа. Модели
даётся не более двух попыток вернуть ровно один исправленный tool call. Никакое
действие до успешной проверки не исполняется; usage всех попыток суммируется, а
в лог попадают только имена и количество tools.

Удалить CW-010 нужно после CM-021, когда пакет сам выполняет bounded correction
для первой schema-validation/parallel-call ошибки, позволяет consumer передать
безопасную product-validation причину для correction и возвращает
типизированный безопасный результат вместо общей ошибки.

## Что не является workaround

Эти части принадлежат Image Production и не должны переезжать в универсальный
пакет:

- Better Auth session, workspace membership и tenant ownership;
- сопоставление продуктовых ролей с permissions ChatModule;
- server-side OpenRouter connection, лимит ответа и запрет ключа в browser;
- document context, revision, route, selection и server revalidation;
- определения и реализации `knowledge_search`, `node_catalog`,
  `document_graph`, `pipeline_build`, `pipeline_update` и будущих tools;
- строгая product validation, компиляция graph patch, совместимость портов,
  разрешённые settings и расчёт координат нод;
- привязка conversation к document/user контексту продукта;
- плавающий resizable host shell, Feedback tab и конкретная политика React Flow
  canvas; универсальный drop-zone API остаётся запросом CM-017;
- consumer theme, presentation policy и продуктовый system prompt.

## Процесс при каждом обновлении ChatModule

1. Все пакеты ChatModule обновляются одной exact-version семьёй.
2. Changelog и migration notes сопоставляются с открытыми CM/CW IDs.
3. Старый обход удаляется одновременно с подключением публичного API пакета.
4. Миграции применяет продукт явной командой, без reset данных.
5. Выполняются version check, typecheck, lint, architecture, size, tests, build,
   database smoke и browser scenarios.
6. Автоматический merge dependency bump запрещён: package CI не заменяет
   проверку установленного Image Production consumer.
