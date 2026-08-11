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

## Product-specific наблюдения Image Production

| ID | Статус | Наблюдение |
| --- | --- | --- |
| IP-001 | `product-only` | Для вопроса «продукт + ноды + пайплайн» нужны до трёх read-only tool calls; лимит остаётся server-owned и ограничен cost guard. |
| IP-002 | `product-only` | Общий запрос к `node_catalog` не должен создавать ложный ответ «нод нет»: consumer возвращает ограниченный полный реестр, если фильтр ничего не нашёл. |
| IP-003 | `product-only` | Размер и жизненный цикл плавающей панели принадлежат host UI: Image Production ограничивает resize сверху/слева и не размонтирует чат при переходе на Feedback. |
| IP-004 | `product-only` | ChatModule 0.5.1 уже поддерживает Markdown и typewriter через semantic blocks/metadata; consumer преобразует assistant text в Markdown и анимирует только последний ответ. |

## Новые наблюдения

Следующее замечание добавляется сюда с новым ID, датой, воспроизведением и
ожидаемым поведением. До накопления согласованного пакета этот документ является
source of truth для следующего патч-релиза ChatModule.
