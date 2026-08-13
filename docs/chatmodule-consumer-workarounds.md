# ChatModule consumer workaround retirement ledger

Этот документ фиксирует временный код Image Production, который нельзя
незаметно превратить в постоянный fork ChatModule. Запись закрывается только
после обновления опубликованного пакета и проверки установленного consumer.

Статусы: `active`, `consumer-verified`, `removed`, `keep-product-specific`.

## Состояние после перехода на ChatModule 0.7.0

| ID | Связь | Статус | Результат в consumer |
| --- | --- | --- | --- |
| CW-001 | CM-001 | `removed` | Удалён bound browser `fetch`; используется штатный SDK client. |
| CW-002 | CM-003 | `removed` | Удалён JSON override; turn снова идёт через штатный SSE transport. |
| CW-003 | CM-005 | `removed` | Удалён локальный фильтр tool cards; используются package presentation policies. |
| CW-004 | CM-006 | `removed` | Удалён CSS, зависящий от внутренних author/meta классов. |
| CW-005 | CM-009 | `removed` | Удалены query selector, `ResizeObserver` и локальный auto-follow. |
| CW-006 | CM-009 / IP-006 | `keep-product-specific` | Host сохраняет canvas wheel boundary: это интеграция overlay с React Flow, а не логика чата. |
| CW-007 | CM-008 | `active` | Знания пока читаются из product-owned Markdown. |
| CW-008 | CM-006 / CM-010 | `removed` | Удалены portal/MutationObserver hover actions; используются package message policies. |
| CW-009 | CM-011 | `active` | Структура графа проверяется строго; bounded settings и частые безопасные замены портов компилируются продуктом и попадают в confirmation preview. |
| CW-010 | CM-012 | `active` | Product использует public `activityLabel`, elapsed timer и реальные tool lifecycle events, но полный agent progress пока недоступен. |
| CW-011 | CM-013 | `active` | Product разводит provider/client timeout и предлагает консервативный повтор только для transient error до write proposal. |
| CW-012 | CM-014 | `active` | Product сбрасывает ошибочную dot-геометрию с вложенного public `activityLabel`; удалить после сужения package CSS-селектора. |
| CW-013 | CM-015 | `active` | Product скрывает persisted `tool-status`; package tool panel остаётся единственным видимым lifecycle. |
| CW-014 | CM-016 | `active` | Product connector повторяет transient provider call внутри исходного turn с bounded backoff. |

Проверка 0.7.0 включает штатный SSE model/tool/model turn, отсутствие двойных
сообщений и списаний, package-owned time/copy, скрытые author labels,
follow-to-latest и package tool renderer. Полная browser-проверка должна
повторяться при каждом следующем bump.

## CW-006 — canvas wheel boundary остаётся продуктовым

`AssistantShell` помечает overlay через `data-canvas-wheel-block`, а
`use-canvas-navigation.ts` не передаёт wheel/pan событие canvas, если курсор над
этой областью. Это обязанность host: только Image Production знает, что за
чатом находится масштабируемый граф. Удалить marker можно лишь если будущий
публичный embedded-surface contract полностью закроет конфликт.

Проверка: колесо/трекпад над чатом прокручивает чат, над canvas — canvas;
достижение края истории не прокручивает подложку; zoom canvas продолжает
работать вне панели.

## CW-007 — файловая Knowledge Base остаётся временной

Сейчас `knowledge-base.ts` читает фиксированный набор файлов из
`docs/assistant-knowledge`, а Dockerfile переносит Markdown в runtime image.
Когда stable ChatModule поставит CM-008:

1. Подключить опубликованные storage/search/auth adapters и миграции.
2. Импортировать Markdown в draft versioned collection.
3. Проверить tenant isolation, citations, publish, rollback и reindex.
4. Переключить agent retrieval на опубликованный snapshot.
5. Только после rollback-окна удалить loader/test и Docker COPY.

Исходные документы нельзя удалять до подтверждённого переключения.

## CW-009 — защита от ошибки product action prepare

ChatModule 0.7.0 пока завершает весь SSE turn ошибкой, если аргументы модели не
проходят tool schema или product-owned `prepare`. Image Production строго
проверяет node type, key, edges, ports и лимиты, но принимает максимум 24
ограниченных settings на ноду. Помимо scalar полей разрешён один
типизированный bounded-список `textPrompt.variables` до 10 элементов. Затем
продукт применяет allowlist и
проверяет значение каждого разрешённого поля; лишнее или неподходящее поле не
попадает в граф и показывается пользователю как warning в безопасном preview.
Каталог удаляет общие query-токены вроде `ports`, чтобы запрос трёх нод не
возвращал модели весь реестр из 26 типов. Server log остаётся bounded и содержит
только имя ошибки, ограниченное сообщение и tool call ID. Дополнительно product
gateway до передачи результата ChatModule даёт модели до двух попыток исправить
невалидные аргументы `pipeline_build`/`pipeline_update`; usage исправляющих
provider calls суммируется, а ни один write tool до успешной проверки не
исполняется.

Для топологических замен product compiler делает две ограниченные
коррекции до создания proposal: замена связи с уже занятого целевого
порта явно включает старую edge в `removeEdgeIds`, а concat-style alias `text-N`
на `textPrompt` нормализуется в `variable-N`. Оба изменения показываются в
preview и по-прежнему требуют явного подтверждения пользователя. Это
продуктовая компиляция графа, её не нужно удалять после CM-011.

После исправления CM-011 в пакете нужно оставить продуктовую валидацию, но
удалить специальную диагностическую компенсацию и проверить штатный lifecycle:
ошибка prepare сохраняется как failed action, модель может один раз исправить
аргументы, пользователь получает безопасное понятное сообщение, а повтор не
создаёт второго действия или списания.

## CW-010 — временный индикатор этапа и elapsed timer

Image Production показывает прошедшее время локально и меняет подпись только по
фактам, которые уже доступны через public API: состояние runtime и backend tool
lifecycle. Между этими событиями используется общее «Анализирую запрос» — это не
попытка показывать скрытое reasoning. После поставки CM-012 нужно удалить
product mapping/timer и перейти на package renderer с сохранённым server
`startedAt`, проверив reload, reconnect, cancel и long-running tool.

## CW-011 — временный безопасный повтор

Provider получает 120 секунд, а browser SDK — 135 секунд, чтобы сервер первым
зафиксировал и вернул timeout. Локальная кнопка повторно отправляет исходный
пользовательский текст только для timeout/network/408/502/503/504 и скрывается,
если после этого сообщения уже появился non-read tool call. Синтетический
runtime error скрывается, чтобы пользователь видел одну recovery-панель. Пока
package retry operation отсутствует, consumer также сворачивает и в UI, и в
контексте провайдера соседние одинаковые user messages от повторных попыток.
В PostgreSQL failed attempts остаются как audit-записи и не удаляются.

Это консервативная компенсация: runtime 0.7.0 хранит только строку ошибки и не
передаёт точный retryable/execution state. После CM-013 удалить локальную
классификацию, timeout-константу UI, фильтр synthetic error и повтор через новый
user message, включая consumer deduplication; использовать package retry
operation с idempotency/reconciliation.

## CW-012 — временная компенсация CSS activity label

ChatModule 0.7.0 применяет `.cm-typing span` не только к трём анимированным
точкам, но и к любому `span` внутри public `activityLabel`. Локальный scoped CSS
возвращает нормальные размеры, фон и animation нашим вложенным элементам и
удерживает подпись с таймером в одной строке.

После поставки CM-014 удалить этот reset и проверить составной ReactNode-label
в установленном consumer: штатные точки анимируются, а текст и `<time>` не
получают dot-стили и не переносятся при достаточной ширине панели.

## CW-013 — временное скрытие дублирующего confirmation status

Runtime 0.7.0 сохраняет assistant `tool-status` со значением
`needs-confirmation`, а `ChatToolCallPanel` независимо показывает полноценное
превью и кнопки. Статический message block не обновляется после terminal status,
поэтому consumer удаляет такие blocks только из presentation-модели; audit и
записи PostgreSQL не изменяются.

После поставки CM-015 удалить `hideToolStatusBlocks` и проверить pending,
confirm, reject, reload и reconnect. В каждом состоянии должна оставаться одна
актуальная package-owned карточка без устаревшего предупреждения.

## CW-014 — bounded provider retry

`LimitedOpenRouterGateway` повторяет один и тот же provider call максимум три
раза только для ошибок, которые connector явно пометил `retryable`. Backoff
ограничен server config, пользовательский turn и message не создаются заново.
Permanent ошибки ключа, баланса, прав и отмена сразу возвращаются runtime.

После поставки CM-016 удалить `provider-retry.ts` и server retry config, перейти
на package retry policy и проверить суммарный usage, `Retry-After`, общий turn
deadline, cancel во время backoff и отсутствие повторного write action.

## Что не является workaround

Эти части принадлежат Image Production и не должны переезжать в универсальный
пакет:

- Better Auth session, workspace membership и tenant ownership;
- сопоставление продуктовых ролей с permissions ChatModule;
- server-side OpenRouter connection и запрет ключа в browser;
- document context, revision, route, selection и server revalidation;
- определения и реализации `knowledge_search`, `node_catalog`,
  `document_graph`, `pipeline_build`, `pipeline_update` и будущих product tools;
- привязка ChatModule conversation к document/user контексту продукта;
- расчёт координат product nodes, их port compatibility и разрешённые settings;
- плавающий resizable host shell, Feedback tab и canvas overlay boundary;
- consumer theme и продуктовый system prompt.

## Процесс при каждом обновлении ChatModule

1. Dependabot создаёт один PR на всю exact-version семью ChatModule.
2. Changelog и migration notes сопоставляются с CM/CW IDs.
3. Изменение переводится на публичный API; старый и новый путь одновременно не
   оставляются.
4. Миграции применяет продукт явной командой, без reset данных.
5. Выполняются version check, typecheck, lint, architecture, size, tests, build,
   database smoke и browser scenarios.
6. Только после consumer-проверки запись получает статус `removed`.

Автоматически merge dependency bump нельзя: успешный тест внутри ChatModule не
заменяет проверку реального Image Production consumer.
