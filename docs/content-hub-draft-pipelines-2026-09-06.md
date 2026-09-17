# Content Hub: черновики и анализ выборки канала

Локальная реализация по явному запросу владельца, 2026-09-06. Это готовые
конфигурации существующих узлов, не расширение runtime и не production-релиз.
Главный consumer handoff находится в Content Hub:
`docs/content-hub-draft-pipelines-2026-09-06.md`.

- `content.generate-seo-draft`: `pln_01a075e809c57b0db3d3825676a4c537`, v2.
- `content.generate-telegram-draft`: `pln_01a075e809dc7008a78f474e178551ab`, v1.
- `channels.analyze-telegram-sample`: `pln_01a0761e78417dabbd608026ef545e8e`, v1.
- Input `{brief:text}`; output `{draft:text}` для черновиков, `{analysis:text}`
  для анализа — Markdown, обязательные поля.
- Тот же Workspace client Content Hub; PINNED, BEST_EFFORT без денежного cap,
  maxAttempts 1. Новых credentials не выпускалось.

Новые документы созданы штатной application-службой в Workspace
`019f6dff-f0d3-7b5d-8a2b-772de4dcab29`, без изменений существующих пользовательских
канвасов и параллельного audio/video WIP. В каждом только Input → Text Gen → Output.

Рецепты в `scripts/content-hub-pilot-recipes.ts` запрещают выдумывать факты,
авторский опыт, цифры, цитаты и источники. Недостающая фактура обозначается
редактору. Задача — структура и короткий начальный текст, не финальная публикация.
Материалы и контекст приходят от CH; этот pipeline не выполняет web research и
не отправляет публикации в Telegram.

Операторская команда (Node 24.15+, из корня IP):

```bash
node --experimental-strip-types --loader ./scripts/node-test-loader.mjs scripts/content-hub-pilot-pipelines.ts --user PIINPnqwnW7k8nKwbK3HSIrcxgGLc8oY --workspace 019f6dff-f0d3-7b5d-8a2b-772de4dcab29 --client 01a07324-4aa2-785a-a957-28e7b5fa3525 --consumer-workspace 9d1f2f02-4ec3-4a3c-bfcc-098cd68d56f8
```

Без `--apply` — только preflight; добавление `--apply` разрешает создание
недостающих документов/published versions/grants. Повтор проверен без дублей.
Редактированные в Studio документы команда не перезаписывает. Для изменения
рецепта использовать нормальную публикацию новой immutable версии и явный repin.

Проверено: compilation 3/3, ESLint новых файлов, полный TypeScript. Выполнены
четыре явно согласованных consumer dispatch из CH с десятью опубликованными KB-записями Юлии.
Telegram run `01a07605-dee6-7a75-b729-1ed3beac1ff2` успешен: 1 вызов,
8 849 токенов, usage COMPLETE, 0.00727250 USD. SEO run
`01a07605-d09b-786a-8b77-4d823e47eae1` завершился `missing_modality`:
провайдер вернул operation ID без требуемого текста. Повтор того же consumer key
не создаёт новый run. Единственный дополнительный retry v1
`01a07615-8f45-7064-9c61-2ae123021496` завершился той же ошибкой. Оба Google SEO
job reconciled с cost 0 и пустым finish reason; данных за исчерпание бюджета
выходных токенов нет. Автоматических повторов и дублирующего canary напрямую из IP нет.

В рамках согласованного локального тестирования создана SEO v2 с моделью
`anthropic/claude-haiku-4.5`: сохранён весь существующий snapshot, кроме модели,
с CAS draft revision 4 → 5; опубликована immutable v2; grant repinned revision 1 → 2.
Никакие старые операции и v1 не переписаны. Новый контрольный run
`01a0761c-d73a-7207-a1b4-2677daede8e1` SUCCEEDED, 20 526 ms, 3 101 символ,
10 734 токена, COMPLETE usage, 0.01912200 USD. CH сохранил результат через свой
application API в неопубликованную тестовую Publication #23. Это работающий
fallback модели, не утверждение об исправлении ошибки Google runtime.
Сумма ненулевых расходов canary — 0.02639450 USD; не средняя цена готовой статьи.
Replay успешных и failed keys после repin не создаёт новых runs.

## Анализ последней выборки Telegram

Studio document `01a0761e-7832-7dac-a4b1-1d9551ff9bba`, grant
`01a0761e-7848-7fbb-b622-8d0e318f1831`, revision 1. Модель
`google/gemini-2.5-flash`; pipeline checksum
`2d7bf54bcf4c7209155a4ddc1ffecaa60d26ff093247e8835d688fe7203a4574`.
CH передаёт серверную неизменяемую выборку до 20 постов и опубликованный
Workspace KB-контекст. Промпт разделяет наблюдаемое в выборке и гипотезы;
даёт tone of voice, темы, пробелы и рекомендации, но не меняет KB автоматически.
Отсутствующие метрики не превращаются в ноль. Анализ не выполняет web search
и не называется исследованием рынка. Pipeline опубликован и grant выдан;
платный semantic canary не запускался без подтверждённой реальной выборки.

Найден диагностический долг: безопасный descriptor `ShortAiExecutionError`
теряется при преобразовании неизвестной ошибки в общий `pipeline_handler_failed`.
Нужно отдельное узкое улучшение mapping кода/повторяемости ошибки без раскрытия
секретов. Его нельзя исправлять промптом или выдавать provider usage за наличие
пригодного результата. Read-only reconciliation первого SEO job дал total_cost=0,
9 821 токенов и пустой finish_reason; тексты из этого запроса не сохранены.

## Обязательное сохранение локальной сети

При повторном запуске 06.09.2026 web-контейнер оказался только в основной
сети IP. Content Hub продолжал обращаться к `image-production-api:3000`, но
получал DNS `ENOTFOUND`; оба продукта по отдельности были healthy. Соединение
восстановлено без остановки контейнеров точечной командой:

```sh
docker network connect --alias image-production-api prodaction-services-local image-prodaction-web-1
```

Это разовое восстановление существующей связи, не замена Compose-конфигурации.
Уже имеющийся чистый `compose.integration.yaml` сохраняет alias и обе сети.
При каждом `up`, пересоздающем локальный web-сервис для интеграционного пилота,
нужно включать этот overlay **вместе со всеми остальными используемыми локальными
overlays**, например `docker compose -f compose.yaml -f compose.integration.yaml up -d web`.
Повторный `up` только с базовым compose снова отсоединит интеграционную сеть.
Полный сетевой runbook: [local-pipeline-consumer-e2e.md](local-pipeline-consumer-e2e.md).
