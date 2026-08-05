# Runtime API исполняемых пайплайнов

## Что уже работает

Опубликованный в Studio pipeline получает стабильный `publicId`. Внешний сервис
может поставить запуск в очередь, проверить его состояние и отменить незавершённый
запуск. Сам граф исполняет отдельный процесс `pipeline-worker`, поэтому HTTP-запрос
не ждёт ответа AI-провайдера и не теряет задачу при перезапуске web-приложения.

Промышленный registry поддерживает серверные операции:

- `text.template.render`;
- `text.concat`;
- `text.split`;
- `text.format`;
- `ai.text.generate` через Workspace OpenRouter connection;
- `ai.image.analyze` для ноды Extract;
- `ai.image.generate` через общую очередь генерации и S3/MinIO assets.

`Router` не запускает отдельную операцию: при публикации компилятор прозрачно
соединяет его вход с потребителем. Публикация отклоняется заранее, если хотя бы
для одной ноды нет production-handler. Builder-ноды, коррекция изображений и
публикации в сторонние сервисы пока не входят в серверный registry.

AI-вызов использует отдельный durable generation job и контрольную точку результата.
Повторная обработка одного `pipelineRunId + nodeId` восстанавливает уже оплаченный
результат, а не вызывает провайдера повторно.

## Авторизация

Runtime API не использует браузерную сессию. Для каждого endpoint создаётся
отдельный service token. В базе хранится только SHA-256 hash; исходный token
показывается один раз при создании.

Локальное создание ключа:

```bash
npm run pipeline:key:create -- \
  pln_REPLACE_WITH_PUBLIC_ID \
  content-ops \
  "Content Ops local integration"
```

Сохраните поле `token` из JSON-ответа в secret-настройках сервиса-потребителя.
Не добавляйте token в git, документы или клиентский JavaScript.

## Запуск

```http
POST /v1/pipelines/{publicId}/runs
Authorization: Bearer rvr_pipe_...
Idempotency-Key: content-item-123
Content-Type: application/json

{
  "input": {
    "input": "Исходный текст"
  }
}
```

Успешная постановка возвращает `202 Accepted`, поле `id` с идентификатором запуска,
статус `queued` и
`statusUrl`. Повтор того же запроса с тем же `Idempotency-Key` возвращает тот же
запуск. Использование ключа с другим payload возвращает `409`.

## Playground внутри Image Production

Страница `/playground` — первый встроенный потребитель runtime. Пользователь может
вставить endpoint текущего развёртывания, а интерфейс по опубликованному контракту
автоматически построит поля ввода. Текст передаётся напрямую, загруженное изображение
сначала становится Workspace asset, после чего runtime получает типизированную ссылку
`{"kind":"image","assetId":"..."}`.

Playground запускает ту же запись `pipeline_run`, тот же `pipeline-worker` и те же
production handlers, что и внешний API. Различается только авторизация: браузер
использует пользовательскую сессию и внутренние маршруты `/api/pipeline-playground/*`.
Service token в клиентский JavaScript не передаётся.

Чтобы открыть конкретный pipeline сразу, в таблице `Pipelines` используется ссылка:

```text
/playground?endpoint=/v1/pipelines/{publicId}/runs
```

В первой версии Playground принимает только endpoint из того же развёртывания. Это
не позволяет использовать сервер как прокси для произвольных внешних URL.

## Получение результата

```http
GET /v1/runs/{runId}
Authorization: Bearer rvr_pipe_...
```

Пока задача выполняется, `outputs` равен `null`. После статуса `succeeded` там
находится объект выходов, автоматически выведенных при публикации pipeline.
Изображение возвращается не бинарной строкой, а типизированной ссылкой:

```json
{
  "image": {
    "kind": "image",
    "assetId": "019f...",
    "mimeType": "image/png",
    "sizeBytes": 123456,
    "width": 1024,
    "height": 1024,
    "checksumSha256": "...",
    "contentUrl": "/v1/runs/{runId}/artifacts/{assetId}"
  }
}
```

Содержимое `contentUrl` скачивается тем же Bearer token. Endpoint разрешает
получить только asset, который действительно объявлен результатом этого run.

## Отмена

```http
POST /v1/runs/{runId}/cancel
Authorization: Bearer rvr_pipe_...
```

Queued/failed запуск закрывается сразу. Running запуск получает запрос отмены;
worker замечает его на heartbeat и не фиксирует запоздалый результат.

## Локальный контур

```bash
docker compose up --build --detach
curl --fail http://localhost:3004/api/health/pipeline-worker
```

В DataGrip основными таблицами будут:

- `pipeline_endpoint` — стабильный endpoint и активная версия;
- `pipeline_api_key` — hash service token и дата последнего использования;
- `pipeline_run` — очередь, вход, статус и результат;
- `pipeline_node_run` — журнал выполнения каждой ноды и каждой попытки;
- `generation_job` и `usage_event` — физический вызов OpenRouter и его расход.

После успешного запуска `pipeline_run` также получает суммарные токены и
фактическую стоимость связанных AI-вызовов. Идемпотентность изолирована по
pipeline и `sourceApplication`: одинаковые ключи в разных продуктах или разных
pipeline не конфликтуют.

Критический smoke-тест CI проверяет публикацию, отказ без token, запуск через
Runtime API, получение результата, повтор без второго вызова, конфликт payload,
метрики и журнал нод.

Для `Import Image` внешний input имеет вид
`{"kind":"image","assetId":"..."}`. Asset должен существовать в том же
Workspace. Отдельный service endpoint для загрузки входных файлов остаётся
следующим этапом; первый внешний image-pipeline уже можно строить как
`Text Prompt → Generate Image → Preview`.
