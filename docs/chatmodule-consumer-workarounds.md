# ChatModule consumer workaround retirement ledger

Этот документ — обязательный чек-лист удаления временного кода Image Production
после выхода новых версий ChatModule. Backlog описывает, что должен исправить
внешний модуль; этот ledger описывает, какой consumer-код после этого надо
заменить или удалить.

Главное правило: workaround не становится постоянной архитектурой только потому,
что сейчас удобен. Но его нельзя удалять только по записи в changelog — сначала
нужны опубликованный пакет, его migration notes и повторная проверка в
установленном Image Production consumer.

Статусы: `active`, `ready-to-replace`, `consumer-verified`, `removed`,
`keep-product-specific`.

## Активные workarounds

| ID | Upstream | Статус | Временная реализация | Что должно заменить её |
| --- | --- | --- | --- | --- |
| CW-001 | CM-001 | `active` | Consumer передаёт bound browser `fetch` | Receiver-safe default fetcher в `chat-sdk` |
| CW-002 | CM-003 | `active` | Consumer подменяет SSE turn на JSON endpoint | Исправленный typed SSE transport пакета |
| CW-003 | CM-005 | `active` | Consumer скрывает завершённые tool calls | Per-message sources/tool presentation ChatModule |
| CW-004 | CM-006 | `active` | Scoped CSS скрывает `Assistant` и `User` | Typed author/time visibility settings |
| CW-005 | CM-009 | `active` | Consumer query-selects `.cm-thread` и ведёт auto-follow | Встроенный scroll lifecycle ChatModule |
| CW-006 | CM-009 / IP-006 | `active` | Host объявляет собственную canvas wheel boundary | Stable embedded scroll boundary/adapter пакета |
| CW-007 | CM-008 | `active` | Knowledge читается из Markdown consumer при build | Управляемый versioned Knowledge Base package |

## CW-001 — удалить bound browser fetch

- **Сейчас:** `src/modules/chat-assistant/adapters/client/chat-client.ts`
  передаёт `globalThis.fetch.bind(globalThis)`; совместимость закреплена в
  `chat-client.test.ts`.
- **Триггер замены:** опубликованная версия `chat-sdk` сама безопасно вызывает
  browser fetch и содержит regression test для receiver.
- **Действие:** убрать consumer `fetcher`, использовать package default и
  заменить тест обхода на smoke test штатного клиента.
- **Проверка:** list/create conversation и turn работают в Chrome без
  `Illegal invocation`; workspace header сохраняется.

## CW-002 — вернуть штатный SSE transport

- **Сейчас:** consumer-класс `ImageProductionChatClient` переопределяет
  `streamTurn()` и вызывает JSON `/chat/v1/turn`.
- **Триггер замены:** `chat-runtime-next -> chat-sdk -> chat-runtime-core`
  публикуют единый wire contract, где итоговый SSE event возвращает полный
  `ChatTurnResponse`.
- **Действие:** удалить override и, если он больше ничего не добавляет, весь
  consumer subclass; вернуть штатный `RestSseChatClient.streamTurn()`.
- **Проверка:** обычный ответ, model/tool/model turn, cancel, error и reconnect
  проходят через SSE; нет двойных сообщений и двойного списания.

## CW-003 — удалить фильтр технических tool cards

- **Сейчас:** `chat-tool-call-presentation.ts` оставляет в UI только
  `needs-confirmation` и `failed`; `ImageProductionChat` передаёт отфильтрованный
  массив.
- **Триггер замены:** ChatModule связывает tool/LLM calls с assistant message и
  поставляет компактные sources/tool details под конкретным ответом.
- **Действие:** удалить consumer filter и его тест, перейти на публичную
  presentation policy/slot пакета. Не возвращать raw input/output в основной
  пользовательский поток.
- **Проверка:** read-only knowledge calls показаны как компактные источники под
  нужным ответом; confirmation и failure остаются заметными; полный audit
  сохранён в PostgreSQL.

## CW-004 — удалить CSS для подписей ролей

- **Сейчас:** `assistant-shell.css` скрывает `span` внутри `.cm-message-meta` для
  user/assistant и вручную оставляет время справа.
- **Триггер замены:** `ChatAppearanceSettings` получает независимые typed
  параметры для user author, assistant author и message time.
- **Действие:** включить package settings и удалить role/meta CSS selectors.
- **Проверка:** `User`/`Assistant` скрыты, время остаётся, support-agent identity
  не исчезает и CSS consumer не зависит от внутренней DOM-структуры пакета.

## CW-005 — удалить локальный auto-follow

- **Сейчас:** `use-chat-thread-auto-scroll.ts` через внутренние `.cm-thread` и
  `.cm-message-stack` управляет `scrollTop`/`ResizeObserver`; рядом находятся
  `chat-scroll-position.ts` и тест. `ImageProductionChat` добавляет wrapper и
  вручную включает follow перед submit. CSS выравнивает короткий диалог снизу и
  задаёт `overscroll-behavior`.
- **Триггер замены:** ChatModule штатно поддерживает follow-to-latest во время
  submit/streaming/typewriter, отпускание при ручном scroll и jump-to-latest.
- **Действие:** удалить hook, helper, тест, wrapper и связанные `.cm-thread` /
  `.cm-message-stack` overrides; использовать только публичный scroll contract.
- **Проверка:** Enter из середины истории переходит вниз; typewriter растёт
  вверх над composer; ручной scroll не перетягивается обратно; новый submit
  возобновляет follow; переключение вкладок не сбрасывает позицию.

## CW-006 — заменить canvas wheel boundary на стабильный контракт

- **Сейчас:** `AssistantShell` выставляет `data-canvas-wheel-block`, а
  `use-canvas-navigation.ts` знает этот consumer-specific selector.
- **Триггер замены:** embedded ChatModule либо сам изолирует wheel/overscroll,
  либо публикует стабильный ref/data attribute/adapter для scroll region.
- **Действие:** удалить собственный marker и ветку canvas navigation только если
  package contract полностью закрывает конфликт. Если upstream исправил только
  auto-follow, этот workaround пока остаётся.
- **Проверка:** физическое колесо/трекпад над чатом прокручивает чат, над canvas —
  canvas; границы истории не передают scroll подложке; zoom с modifier над
  canvas продолжает работать.

## CW-007 — мигрировать файловую Knowledge Base

- **Сейчас:** `knowledge-base.ts` читает фиксированный список из
  `docs/assistant-knowledge`; `knowledge-tool-gateway.ts` вызывает локальный
  поиск, а Dockerfile копирует Markdown в runtime image.
- **Триггер замены:** stable Knowledge Base package из CM-008 имеет versioned
  storage, editor/publisher RBAC, retrieval, citations, import и rollback.
- **Действие:** импортировать текущие документы в draft collection, проверить и
  опубликовать revision, переключить agent retrieval на package service. После
  consumer verification удалить файловый loader/test и Docker COPY. Исходные
  Markdown не удалять до завершения rollback-окна.
- **Проверка:** ответы ссылаются на точные source/revision; draft не читается
  агентом; tenant isolation, publish, rollback и reindex проходят; результат на
  golden questions не хуже файловой версии.

## Что не удалять автоматически

Следующие элементы — не дублирование ChatModule, а product adapters и политика
Image Production. Их можно менять только отдельным архитектурным решением:

- Better Auth session, workspace membership и tenant ownership на сервере;
- сопоставление продуктовых ролей с permissions ChatModule;
- выбор server-side OpenRouter connection и запрет передачи ключа в browser;
- product context: document id/revision, route, selection и server revalidation;
- реализации product tools, включая `node_catalog`, и ограничения cost/rate;
- безопасные provider-compatible IDs `knowledge_search`/`node_catalog`: после
  CM-002 пакет добавит валидацию, но стабильные имена не надо переименовывать;
- плавающий resizable host shell, вкладка Feedback и решение не размонтировать
  чат между вкладками;
- consumer theme и осознанная Markdown/typewriter presentation policy, пока они
  используют публичные контракты пакета.

## Процесс при каждом обновлении ChatModule

1. Dependabot создаёт один PR на всю exact-version семью ChatModule.
2. Прочитать changelog и migration notes; сопоставить исправления с CM/CW IDs.
3. Перевести подходящие записи в `ready-to-replace`, но пока не удалять код.
4. В том же PR или отдельном явно связанном commit заменить workaround на
   публичный API. Не оставлять одновременно два активных пути.
5. Выполнить migration/reindex только явной командой продукта; проверить
   rollback до удаления старого пути.
6. Прогнать package version check, typecheck, lint, architecture, tests, build,
   Docker и перечисленные browser scenarios.
7. После consumer-проверки записать версию ChatModule и commit удаления,
   перевести CW в `removed`, а CM — в `consumer-verified`.

Dependency bump нельзя автоматически merge, пока активные CW-записи для
заявленных upstream fixes не рассмотрены. Один успешный monorepo test внутри
ChatModule не заменяет проверку установленного Image Production consumer.
