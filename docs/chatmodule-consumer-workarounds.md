# ChatModule consumer workaround retirement ledger

Документ хранит только актуальные временные обходы Image Production и
продуктовые границы, которые важно не перепутать с универсальным ChatModule.
История уже удалённых обходов остаётся в Git.

## Состояние после перехода на ChatModule 0.12.0

| ID | Связь | Статус | Текущее решение |
| --- | --- | --- | --- |
| CW-006 | canvas integration | `keep-product-specific` | Host блокирует передачу wheel/pan события из панели чата в React Flow canvas. |
| CW-007 | CM-008 | `active` | Knowledge Base пока читается из product-owned Markdown. |
| CW-012 | CM-026 | `active` | Host готовит preview по актуальной server revision, если browser selector устарел во время model turn; подтверждение остаётся защищено concurrency token. |
| CW-013 | CM-027 | `active` | Host временно рендерит и сохраняет предметный multi-select объектов макета до появления универсального package interaction lifecycle. |

ChatModule 0.12.0 сохраняет штатные возможности, ради которых в 0.11.0 были
удалены CW-008–CW-010:

- headless drop-zone и overlay для всей host-области чата;
- компактные managed thumbnails, upload lifecycle и немедленную очистку
  composer после submit;
- независимый model-delivery resolver, включая ограниченную inline-передачу
  приватного изображения внешнему AI-провайдеру;
- bounded recovery malformed/invalid/parallel tool calls и повтор после
  безопасной ошибки подготовки действия;
- раннюю привязку conversation ID, persistent conversation events и
  восстановление первого неуспешного turn.

Локальные реализации этих функций удалены. Image Production использует
публичные `useChatAttachmentDropZone`, `ChatAttachmentDropOverlay`,
`managedAttachments`, `createSubmitOptions`, `modelDelivery`,
`toolCallRecovery` и persistent event bus версии 0.12.0. Продукт по-прежнему
владеет строгой проверкой графа и выполнением product tools.

В 0.12.0 также удалены три очередных consumer workaround. Composer использует
публичную `composerKeyboardPolicy="focused"`, поэтому host больше не
перехватывает клавиатурные события и не вычисляет focus state пакета. Retry
переносит сохранённые `contextSelectors` исходного user message и передаёт их
штатному host-owned `verifiedContextResolver` для новой server-side проверки.
События tool lifecycle приходят в основном turn SSE до terminal event, поэтому
обычному `RestSseChatClient` больше не нужна вторичная REST-сверка conversation
snapshot.

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

## CW-012 — server-authoritative revision для подготовки preview

ChatModule 0.12.0 по-прежнему сворачивает любую ошибку product `prepareTool` в общий
`CHAT_TOOL_PREPARATION_FAILED`. В реальном turn документ успел сохраниться между
server verification и `pipeline_build`, поэтому безопасный revision drift
выглядел для пользователя как неизвестная «небезопасная» ошибка.

До появления CM-026 `pipeline_build` и `pipeline_update` используют
server-verified document identity, заново загружают документ и строят proposal
по его текущей server revision. Устаревшая revision из browser selector не
является разрешением или concurrency token и не блокирует preview. Явный
`unsaved:*` остаётся fail closed: пока последние изменения существуют только в
браузере, proposal не готовится против более старой серверной копии.

Обход не ослабляет выполнение: membership/workspace проверяются сервером, а
подтверждение требует token конкретной proposal revision и повторно сравнивает
revision под блокировкой/атомарным update. Если граф изменился после preview,
proposal получает conflict и ничего не записывает.

Удалить CW-012 нужно после публикации и consumer-проверки CM-026: ChatModule
должен получить typed context-stale outcome, один раз обновить verified context
в общем recovery budget и вернуть пользователю один актуальный preview без
повторного вопроса. Локальный agent loop и код пакета в Image Production не
копируются.

## CW-013 — временная интерактивная карточка выбора объектов

Для проверки сценария «референс -> редактируемый макет» Image Production
временно владеет read-tool `design_element_selection`, словарём дизайнерских
объектов и renderer карточки выбора. Карточка отправляет канонический
типизированный payload, сохраняет выбранное состояние и продолжает диалог; она
не изменяет canvas и не заменяет подтверждение последующего pipeline preview.
Payload включает выбранные product-owned объекты целиком, в том числе
опциональную примерную область на референсе, чтобы host мог детерминированно
перенести её в собственный placement-контракт.

Product-specific распознавание заголовка, героя, фона, QR и маппинг выбора в
ноды остаются в Image Production. В ChatModule должен переехать только
универсальный lifecycle single/multi-choice, persistence/replay, accessible UI
и transport результата. После consumer-проверки CM-027 локальный renderer и
общая mechanics выбора удаляются, а продукт оставляет лишь options и mapping.

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
- плавающий resizable host shell, Feedback view в product settings и конкретная политика React Flow
  canvas;
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
