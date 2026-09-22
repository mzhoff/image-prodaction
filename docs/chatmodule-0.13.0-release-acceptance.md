# ChatModule 0.13.0: поставка и consumer-проверки

22 сентября 2026. Пакеты опубликованы и установлены в текущий checkout
Production. Новый серверный release Production этой задачей не разворачивался.

## Опубликованный результат

- Версия всей семьи: **0.13.0**, tag `v0.13.0`.
- Commit main: `7d06c2c1a078d3abd47af0df530cddadd7945a26`.
- [PR #27](https://github.com/PRODactionPRO/ChatModule/pull/27).
- [Release](https://github.com/PRODactionPRO/ChatModule/releases/tag/v0.13.0).
- [Migration guide](https://github.com/PRODactionPRO/ChatModule/blob/v0.13.0/docs/migrations/0.13.0-localization.md).
- [CI Node 22/24](https://github.com/PRODactionPRO/ChatModule/actions/runs/35693233102): success.
- [Публикация и проверка private visibility](https://github.com/PRODactionPRO/ChatModule/actions/runs/35693867125): success.

Авторизованное повторное чтение registry подтвердило `0.13.0` и `latest=0.13.0`
для каждого из 22 пакетов. Анонимный запрос `chat-ui` отклонён: HTTP 401.
Миграций БД в ChatModule 0.13.0 нет.

Все имена ниже имеют префикс `@prodactionpro/chat-`:

`api-service`, `application`, `attachments-s3`, `auth-better-auth`, `connectors`,
`domain`, `persistence-drizzle`, `persistence-prisma`, `protocol`, `runtime-core`,
`runtime-hono`, `runtime-next`, `runtime-react`, `runtime-react-native`, `sdk`,
`sdk-react-native`, `server-core`, `server-testkit`, `support-connectors`,
`theme`, `ui`, `voice`.

## Что изменено в Production

- Все 14 прямых ChatModule dependencies переведены с локальных архивов
  `0.12.2-localization.0` на exact stable `0.13.0`.
- `npm run packages -- install` получил пакеты из GitHub Packages и обновил
  lockfile. В нём 14 ChatModule records, все `0.13.0`, все с registry URL;
  старых localization archives и вложенных старых версий нет.
- `PackageLocalization` использует продуктовый RU/EN-переводчик. Добавлен
  перевод английских исходных UI-подписей общих пакетов на русский; значения
  параметров и текст сообщений сохраняются.
- Version-family guard проверяет также вложенные packages и наличие каждой
  прямой зависимости в lockfile. Четыре regression tests включены в обычную
  команду `check:chatmodule-versions`.
- Документация зависимостей и интеграции синхронизирована; defaults ассистента
  исправлены на реальные 3600 output tokens / 6 tools / 7 steps / 75 секунд.

Изменения интеграции оставлены в текущем рабочем дереве Production для общего
release commit. В нём уже есть большой согласуемый набор продуктовых изменений;
данная задача не коммитила его целиком и не создавала копию или worktree.

Файлы этой поставки (существовавшие изменения в них сохранены):

- `package.json`, `package-lock.json`;
- `scripts/check-chatmodule-versions.mjs`, `scripts/check-chatmodule-versions.test.mjs`;
- `src/shared/i18n/package-localization.tsx`;
- `src/shared/i18n/package-translations.ts`, `src/shared/i18n/package-translations.test.ts`;
- `docs/chatmodule-dependency-management.md`, `docs/chat-assistant-integration.md`;
- этот отчёт.

## Выполненные проверки

| Уровень | Результат |
| --- | --- |
| ChatModule local release gate и cold packed consumers | passed |
| ChatModule CI Node 22 и 24 | passed, включая PostgreSQL/Prisma/Drizzle и isolated MinIO |
| ChatModule UI regression tests | 61 passed, включая смену locale без потери draft/focus и нового submit |
| ChatModule security audit | 0 advisories; просроченное исключение удалено, Metro image-size обновлён до 2.0.4 с regression test |
| Production authenticated registry install/check | passed |
| Production version-family policy | passed, 14 packages; 4 guard regression tests |
| Production focused consumer tests | 61 passed в 17 файлах, без skipped, на Node 24.19.0; также проверены на Node 22.16.0 |
| Production typecheck / full lint / architecture | passed на Node 24.19.0 |
| Production production-dependency audit, порог high | passed; остаются 6 moderate findings в существующей цепочке esbuild / drizzle-kit / Better Auth / Identity |

Focused consumer tests покрывают lazy start, Retry с verified context,
вопросы/selectedAction и continuation, Timeline context, document activity,
tool-input diagnostics, LimitedOpenRouterGateway, delivery вложений,
workspace-provider errors через реальный SSE SDK и SSR локализации из
**опубликованного установленного** `@prodactionpro/chat-ui`.
Это не тест живого OpenRouter и не оплаченная генерация.

## Закрытые требования и оставшиеся границы

| Требование | Состояние после поставки | Контракт / проверка | Workaround |
| --- | --- | --- | --- |
| Поставка локализации и публичный hook | Выпущено 0.13.0 | `ChatLocalizationProvider`, `ChatTranslator`, `useChatLocalization`; SSR/RU/EN regression | Локальные ChatModule archives больше не используются |
| Focus-only keyboard, CM-022/CW-011 | Существующий контракт 0.12.0 сохранён | `composerKeyboardPolicy`, upstream regression gate | Не создавать альтернативный composer |
| Retry selectors, CM-023/CW-015 | Существующий контракт сохранён | `verifiedContextResolver`, consumer Retry tests | Server verification сохраняется |
| Tool lifecycle в SSE, CM-028/CW-014 | Существующий контракт сохранён | Upstream runtime/SDK gate, consumer SSE error tests | Не возвращать отдельную REST reconciliation |
| `selectedAction` и продуктовые вопросы, CM-027 | Fix 0.12.1 сохранён, consumer tests passed | Public selectedAction transport + host question/continuation adapters | Общий interaction lifecycle ещё не поставлен; host adapter сохраняется |
| Revision drift, CM-026/CW-012 | Host-owned механизм сохраняется | Server revision + preview/concurrency token | Не удалять до отдельного upstream contract и DB/browser acceptance |
| CM-021/024/025, общий task status и request cost ledger | Новые общие контракты этим релизом не поставлены | Существующие host/runtime механизмы, отдельный backlog | Не объявлять backlog закрытым из-за dependency bump |
| Workspace permissions, генерации, HEIC, Stories/Timeline, usage attribution | Product-owned | Consumer adapters используют опубликованные пакеты | Не переносить предметную логику в ChatModule |

## Что должен завершить общий release Production

1. Зафиксировать общий согласованный состав Production и остальных зависимостей.
   В manifest остаются отдельные `file:` packages UI Media, Stories и Identity;
   ChatModule 0.13.0 их поставку не заменяет.
2. Выполнить cold install/build CI Production из release commit. Текущая локальная
   установка из registry не является доказательством чистой серверной сборки
   всего продукта, пока остальные локальные packages не поставлены.
3. Запустить `test:chat-pipeline-action-smoke` после migrations в изолированной
   тестовой БД. В этой задаче этот smoke по базе Production не запускался.
4. Пройти browser smoke RU/EN на Home, Canvas, Blueprint, герое, Timeline:
   draft/model/attachments, вопрос → ответ → preview → одно применение,
   reconnect/Retry, отказ доступа, HEIC и usage после reload.
5. Проверить выбранное S3, собрать и развернуть согласованный release общим
   deployment-процессом; повторить readiness/worker и пользовательский smoke.

Серверные контейнеры, пользовательские базы, volumes, секреты и платные provider
вызовы эта задача не меняла. Задача подготовки deployment: «Проверить изоляцию
роутов Image». Перед серверным переключением определить единственного владельца
операции, чтобы не конкурировать с другим rollout.
