# Локальный межсервисный E2E для Pipeline Runtime

## Цель и границы

Этот контур проверяет реальный вызов опубликованного Image Production pipeline
из соседнего контейнера. Пока роль потребителя выполняет одноразовый smoke-контейнер.
Content Hub, его UI, база и код в этот этап не входят.

Первый проход делаем на простых, уже опубликованных capability:

- текст: локальный кандидат `Краткое описание статьи`, endpoint
  `pln_019fb9e98e757364b4c34ca908554584`, ранее наблюдавшаяся версия `5`;
- изображение: локальный кандидат `Обложка статьи V2`, endpoint
  `pln_019fd2598f1e7976b0c3f36a36509dd7`, ранее наблюдавшаяся версия `3`.

Это только ориентиры из локального аудита. Перед каждым платным запуском нужно
снова получить текущую pinned version и checksum. Smoke-клиент прекращает работу
до постановки run в очередь, если descriptor не совпадает с ожиданием.

## Топология на одной машине

```text
pipeline-consumer-smoke
        |
        | prodaction-services-local (external + internal)
        v
image-production-api:3000 (только service web)
        |
        | image-prodaction_default
        +--> pipeline-worker
        +--> PostgreSQL
        +--> MinIO
```

`compose.integration.yaml` добавляет к `web` вторую сеть и сохраняет его обычную
сеть. PostgreSQL, MinIO, worker и volumes не публикуются в общую сеть. Отдельный
`compose.pipeline-consumer-smoke.yaml` подключает тестовый consumer только к
общей внутренней сети.

На первой VPS используется та же схема: два стабильных Compose-проекта на одном
хосте, отдельные контейнеры и порты, одна явно созданная service network. Публичный
internet endpoint для связи контейнеров не нужен.

## Подготовка без пересборки образов

Сначала убедитесь, что постоянный Image Production stack уже запущен и его
`pipeline-worker` здоров. Эти команды меняют только сетевое подключение `web`,
не собирают новый образ и не затрагивают volumes:

```bash
docker network inspect prodaction-services-local
docker network create --driver bridge --internal prodaction-services-local
docker compose -f compose.yaml -f compose.integration.yaml \
  up --detach --no-build --no-deps web
```

Команда `docker network create` нужна только если `inspect` показал, что сети нет.
Не запускайте её повторно для уже существующей сети.

## Безопасный service token

Каталог `.secrets/` исключён из git. Создайте его с закрытыми правами и передайте
CLI только путь к новому файлу. Сам token не печатается в stdout, не попадает в
аргументы процесса и не хранится в Compose environment:

```bash
install -d -m 700 .secrets
npm run pipeline:key:create -- \
  pln_REPLACE_WITH_PUBLIC_ID \
  local-e2e \
  "Local pipeline consumer smoke" \
  --token-file "$PWD/.secrets/pipeline-token"
```

Команда откажется перезаписывать существующий файл. Если ключ надо заменить,
сначала выпустите новый в новый файл, проверьте его, переключите consumer и только
потом отзовите старый по точным `apiKeyId` и endpoint:

```bash
npm run pipeline:key:revoke -- \
  01900000-0000-7000-8000-000000000000 \
  pln_REPLACE_WITH_PUBLIC_ID
```

`docker compose run --rm` удаляет только одноразовый consumer-контейнер; исходный
host-файл token остаётся. После подтверждённого переключения и успешного revoke
переместите именно старый файл token в Корзину. Не удаляйте весь `.secrets/`, если
в нём есть другие активные ключи или test fixtures.

## Pinned descriptor и input fixture

JSON-ответ `pipeline:key:create` безопасно возвращает `pinnedVersion.version`,
`pinnedVersion.checksum` и schema checksums, но не сам token. Для повторной сверки
эти же значения можно получить из локальной базы без чтения token. Важно читать
версию consumer, а не изменяемую active version endpoint:

```sql
SELECT
  pe.public_id,
  pv.version,
  pv.checksum,
  pv.input_schema_checksum,
  pv.output_schema_checksum
FROM pipeline_consumer AS pc
INNER JOIN executable_pipeline AS ep ON ep.id = pc.pipeline_id
INNER JOIN pipeline_endpoint AS pe ON pe.pipeline_id = ep.id
INNER JOIN pipeline_version AS pv ON pv.id = pc.pinned_version_id
WHERE pe.public_id = 'pln_REPLACE_WITH_PUBLIC_ID'
  AND pc.source_application = 'local-e2e';
```

Подготовьте два отдельных JSON-файла только с `input`-полями pipeline, без внешней
обёртки `{ "input": ... }`. Оба обязаны проходить один контракт, но отличаться
хотя бы одним значением. Явная вторая fixture нужна, чтобы idempotency-проверка
не ломала enum и другие ограничения схемы автоматической подменой. Для текстового
pipeline это обычно выглядит так:

```json
{
  "input": "Короткая синтетическая заметка для локального E2E-теста."
}
```

Для проверки используйте синтетические данные. Реальные персональные данные не
должны попадать в тестовые fixtures, shell history или логи.

У системных pipeline дополнительно закрепляется semantic capability key, например
`story.asset.render.v1`. Strict descriptor возвращает этот ключ вместе с pinned
version/checksum; consumer может передать `--expected-capability-key` и отклонить
endpoint с другим назначением до платного запуска.

## Один bounded smoke-run

```bash
PIPELINE_TOKEN_FILE="$PWD/.secrets/pipeline-token" \
PIPELINE_INPUT_FILE="$PWD/.secrets/pipeline-input.json" \
PIPELINE_CONFLICT_INPUT_FILE="$PWD/.secrets/pipeline-conflict-input.json" \
PIPELINE_PUBLIC_ID="pln_REPLACE_WITH_PUBLIC_ID" \
PIPELINE_EXPECTED_VERSION="REPLACE_WITH_VERSION" \
PIPELINE_EXPECTED_PIPELINE_CHECKSUM="REPLACE_WITH_SHA256" \
PIPELINE_EXPECTED_OUTPUT_KIND="text" \
docker compose -f compose.pipeline-consumer-smoke.yaml \
  run --rm pipeline-consumer-smoke
```

Для image-canary установите `PIPELINE_EXPECTED_OUTPUT_KIND=image`. Клиент:

1. проверяет `401` без Bearer token;
2. читает authenticated descriptor и строго сверяет `publicId`, pinned version и
   checksum до платного запуска;
3. создаёт ровно один новый run с уникальным `Idempotency-Key`;
4. повторяет тот же запрос и требует тот же `runId`;
5. отправляет вторую contract-valid fixture с тем же ключом и требует `409`;
6. polling-ит только этот run в пределах 90 секунд, при timeout пытается отменить;
7. требует непустой текст либо скачивает image artifact тем же token и проверяет
   MIME, размер, dimensions и SHA-256.

Token читается только из `/run/secrets/pipeline_token`. Input монтируется read-only.
Контейнер работает без Linux capabilities, с read-only root filesystem и не
получает доступ к Docker socket.

Если поднят старый runtime без `GET /v1/pipelines/{publicId}`, smoke завершится с
`descriptor_unavailable` до создания платного run. Временно продолжить можно через
`PIPELINE_ALLOW_LEGACY_RUNTIME=true`, но checksum тогда физически нельзя проверить:
в итоговом JSON будет `pipelineChecksumVerified: false`. Такой режим годится только
для диагностики старого локального контейнера, не для 20-run gate.

## Ограничения стоимости

Smoke создаёт только один новый `runId`; replay и конфликт не должны создавать
новые оплачиваемые вызовы. Время ожидания ограничено пятью минутами на уровне
клиента и по умолчанию составляет 90 секунд. Максимум скачиваемого artifact —
20 MB, максимум image artifacts — четыре.

Текущий `pipeline_consumer.execution_policy` ограничивает число попыток, но ещё не
гарантирует server-side `maximumCost`. До 20-run gate настройте canary consumer на
`maxAttempts = 1`, используйте дешёвую pinned модель и заранее зафиксируйте бюджет.
Client timeout не является денежным лимитом: worker может успеть обратиться к
provider до получения cancel.

## Отчёт для 20 запусков

После отдельно согласованной серии запусков:

```bash
psql "$DATABASE_URL" \
  -v pipeline_public_id=pln_REPLACE_WITH_PUBLIC_ID \
  -v pipeline_version=REPLACE_WITH_VERSION \
  -v source_application=local-e2e \
  -f scripts/pipeline-run-report.sql
```

Отчёт показывает stability, retries, стоимость успешного результата, полный цикл,
provider/model, токены, schema checksums и базовую целостность image asset contract.
В текущей схеме нет полей для ручного QA и факта ручной коррекции. Поэтому эти две
колонки намеренно возвращаются как `NULL`; до появления отдельного review ledger их
нужно вести рядом с `runId` во внешнем чек-листе. Это известный контрактный пробел,
а не нулевое число исправлений.

## Переезд и разделение VPS

На первой VPS сохраняем те же имена сети и DNS alias, меняются только secrets и
production Compose overlays. Когда сервисы разъедутся по разным VPS, Docker DNS уже
не подходит: API связываются по приватному WireGuard/VPC адресу и TLS/mTLS, с тем же
service token, pinned version, checksum и idempotency contract. Базы, object storage
и volumes не объединяются.

Отдельная VPS для LLM proxy является только контролируемым egress transport:

- identity, Workspace authorization, pipeline state, usage ledger и audit остаются
  в Image Production;
- browser и mobile никогда не получают provider credentials или pipeline token;
- до proxy передаётся минимально необходимый обезличенный prompt, без внутренних
  идентификаторов и лишних персональных данных;
- proxy не становится хранилищем контента и не пишет request/response body в логи;
- правила маршрутизации персональных данных и фактические юрисдикции провайдеров
  отдельно подтверждаются юридическим и security review перед production.

Так локальная проверка повторяет стартовую односерверную архитектуру, но не
закрепляет её навсегда и не превращает Image Production в Content Hub.
