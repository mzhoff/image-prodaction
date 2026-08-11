# Chat assistant integration

Image Production использует опубликованные пакеты ChatModule `0.5.1`, не копируя
их исходники. Продуктовый модуль содержит только адаптер Better Auth, Drizzle
persistence, server-owned prompt, read-only tools и UI-композицию.

Для ходов пилота consumer временно использует JSON endpoint `/chat/v1/turn`.
В ChatModule `0.5.1` SSE `message.completed` содержит `ChatMessage`, но SDK
ожидает там `ChatTurnResponse`. После исправления протокола в пакете адаптер
можно вернуть на `/chat/v1/turn/stream` без изменения UI/runtime-контракта.

## Первый этап

- режим `knowledge-base`;
- отдельный серверный OpenRouter-ключ;
- модель по умолчанию `openai/gpt-5.4-nano`;
- максимум 1 200 output tokens на model call, 3 tool calls и 4 шага на turn;
- постфактум cost guard `$0.01` на turn;
- 20 turns в минуту на пользователя и workspace;
- tools `knowledge_search` и `node_catalog`, оба только на чтение;
- история, LLM usage и tool audit сохраняются в PostgreSQL.

## Переменные окружения

```dotenv
CHAT_ASSISTANT_ENABLED=true
CHAT_ASSISTANT_MODEL=openai/gpt-5.4-nano
CHAT_OPENROUTER_API_KEY=
CHAT_TOOL_APPROVAL_SECRET=
CHAT_ASSISTANT_MAX_OUTPUT_TOKENS=1200
CHAT_ASSISTANT_MAX_COST_USD_PER_TURN=0.01
CHAT_ASSISTANT_MAX_TOOL_CALLS_PER_TURN=3
```

`CHAT_OPENROUTER_API_KEY` и `CHAT_TOOL_APPROVAL_SECRET` являются секретами. Их
нельзя добавлять в git, `NEXT_PUBLIC_*`, браузерные настройки или сообщения.
Локально они живут в `.env.local`, на сервере — в secret environment deployment.

## Данные и авторизация

`x-workspace-id` — только селектор. Сервер получает пользователя из Better Auth,
проверяет membership и назначает workspace как tenant. Document context повторно
загружается сервером; browser передаёт только id, revision, route и selection ids.

Миграция `drizzle/0014_cheerful_energizer.sql` создаёт таблицы ChatModule и
применяется обычной командой продукта `npm run db:migrate`. Пакет не запускает
миграции автоматически.

## Управление знаниями и rollback

Знания редактируются Pull Request в `docs/assistant-knowledge`. Технический
каталог нод читается из `NODE_DEFINITIONS`. Для быстрого отключения установите
`CHAT_ASSISTANT_ENABLED=false` и перезапустите web-процесс; существующие записи
чата при этом не удаляются.

Следующий этап — подтверждаемые write tools с optimistic revision, а не прямые
вызовы клиентского Zustand store.
