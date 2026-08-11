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

## Кандидаты в следующий релиз ChatModule

| ID | Приоритет | Область | Статус | Кратко |
| --- | --- | --- | --- | --- |
| CM-001 | P1 | `chat-sdk` | `workaround-active` | Browser `fetch` вызывается с неправильным receiver |
| CM-002 | P1 | contracts / agent | `workaround-active` | Tool name не проверяется на совместимость с OpenAI |
| CM-003 | P0 | Next runtime / SDK / core | `workaround-active` | SSE payload расходится с типом `ChatTurnResponse` |
| CM-004 | P2 | OpenRouter connector | `ready-for-upstream` | Нет защищённой диагностики тела provider error |
| CM-005 | P1 | `chat-ui` / contracts | `workaround-active` | Tool calls всегда выводятся общим списком после сообщений |
| CM-006 | P2 | `chat-ui` | `workaround-active` | Имя автора нельзя скрыть независимо от avatar/bubble |
| CM-007 | P1 | evaluation / persistence / SDK | `ready-for-upstream` | Нет контура человеческой оценки ответов ассистента |

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

### CM-006 — visibility автора сообщения

- **Обнаружено:** 2026-08-11, `showAssistantAvatar: false` и
  `assistantBubble: false`.
- **Evidence:** avatar и bubble скрываются, но `MessageMeta` продолжает выводить
  фиксированное имя `Assistant`; публичного appearance-параметра для автора и
  времени нет.
- **Consumer workaround:** Image Production скрывает author label scoped CSS,
  сохраняя время сообщения.
- **Ожидаемое исправление:** типизированные настройки
  `showAssistantAuthor`/`showMessageTime` либо согласованное поведение, при
  котором скрытие avatar может скрыть и повторяющуюся подпись автора.
- **Regression test:** author visibility управляется без CSS override и не
  затрагивает user/support-agent presentation.

### CM-007 — human evaluation и улучшение базы знаний

- **Обнаружено:** 2026-08-11 при подготовке пилотного quality-review процесса.
- **Что уже есть:** conversations, messages, agent turns, tool outputs, модель,
  latency, tokens и cost сохраняются в PostgreSQL.
- **Чего не хватает:** message/turn evaluation с reviewer, оценкой,
  категориями ошибки, комментарием, исправленным эталонным ответом, статусом
  разбора и версией использованной knowledge base; нет review API/SDK и
  безопасного экспорта eval dataset.
- **Влияние:** вопросы и ответы можно восстановить технически, но нельзя вести
  воспроизводимый цикл «плохой ответ -> причина -> правка знания -> повторный
  тест -> подтверждение улучшения».
- **Ожидаемое исправление:** framework-neutral evaluation contracts и store,
  tenant-scoped API/SDK, связь evaluation с request/response/tool calls и
  knowledge revision. Admin review UI может оставаться product adapter.
- **Regression test:** reviewer оценивает конкретную пару вопрос/ответ,
  сохраняет corrected answer и повторный eval сравнивает новую knowledge
  revision без изменения исходного аудита.

## Product-specific наблюдения Image Production

| ID | Статус | Наблюдение |
| --- | --- | --- |
| IP-001 | `product-only` | Для вопроса «продукт + ноды + пайплайн» нужны до трёх read-only tool calls; лимит остаётся server-owned и ограничен cost guard. |
| IP-002 | `product-only` | Общий запрос к `node_catalog` не должен создавать ложный ответ «нод нет»: consumer возвращает ограниченный полный реестр, если фильтр ничего не нашёл. |
| IP-003 | `product-only` | Размер и жизненный цикл плавающей панели принадлежат host UI: Image Production ограничивает resize сверху/слева и не размонтирует чат при переходе на Feedback. |
| IP-004 | `product-only` | ChatModule 0.5.1 уже поддерживает Markdown и typewriter через semantic blocks/metadata; consumer преобразует assistant text в Markdown и анимирует только последний ответ. |
| IP-005 | `product-only` | До появления per-message source presentation consumer скрывает завершённые read-only tool cards, но не удаляет их audit records из PostgreSQL. |

## Новые наблюдения

Следующее замечание добавляется сюда с новым ID, датой, воспроизведением и
ожидаемым поведением. До накопления согласованного пакета этот документ является
source of truth для следующего патч-релиза ChatModule.
