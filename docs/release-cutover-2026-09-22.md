# Переключение Timeweb на новый релиз — 22 сентября 2026

Статус: **план подготовлен по read-only проверке сервера; переключение не выполнено**.
Сначала обновляем Identity, затем Production. Зелёная сборка подтверждает артефакт,
но не заменяет проверку входа, загрузки файлов и генерации после переключения.

## Фактический сервер

`root@77.233.223.85` (`ludimogut-prod-01`), Docker Compose 5.3.1.
Диск: 48G всего, 13G занято, 35G свободно. Работающих контейнеров — 8:
Identity, его PostgreSQL, Production web/worker/pipeline-worker, его PostgreSQL,
MinIO и общий Caddy. Все семь контейнеров с healthcheck — healthy;
у Caddy отдельный healthcheck не задан, публичные маршруты отвечают.

| Контур | Compose project / каталог | Файлы в точном порядке |
| --- | --- | --- |
| Identity | `reverie-identity`, `/opt/reverie-identity` | `compose.yaml`, `compose.egress.yaml` |
| Production | `reverie-image-production`, `/opt/reverie-image-production` | `compose.production.yaml`, `compose.timeweb.yaml`, `compose.egress.yaml` |
| Общий ingress, сохраняем | `ludimogut`, `/opt/ludimogut` | `docker-compose.prod.yml`, `docker-compose.release.yml` — **полный старый стек не запускать** |

Оба сервиса используют свой `.env.production` с правами `600`. Значения секретов
не выводились. Текущие образы:

- Identity: `reverie-identity:2fc57525752d562d7569c9016b1aeadd14223537`.
- Production web и оба worker:
  `reverie-app:3efab28138f420c30d1481535ab9f87285fc6a8d`.

Сохранить без пересоздания/сброса:

- Identity volume `reverie-identity_identity_postgres`, пользователей, ключи,
  issuer `https://id.apption.space/api/auth`, домен и Telegram-настройки.
- Production volume `reverie-image-production_postgres_data` и MinIO volume
  `reverie-image-production_minio_data` до отдельно выполненного сценария
  сохранения данных или согласованного чистого запуска **только Production**.
- `ludimogut-caddy`, volumes `ludimogut-caddy-config` / `ludimogut-caddy-data`,
  bind `/opt/ludimogut/deploy/Caddyfile.prod`.
- `reverie-egress-tunnel.service`: enabled, active/running. Provider transport
  обслуживает OpenRouter и Telegram через `172.30.89.1:3188`.

Сети и обязательные aliases:

- `ludimogut`: web → `reverie-image-production`, identity → `reverie-identity`,
  Caddy → `caddy`.
- `reverie-provider-egress`: Identity, web, worker, pipeline-worker.
- Identity также остаётся в `reverie-identity-egress` и своей default-сети;
  его PostgreSQL — только в своей default-сети.
- Production web/workers/БД/MinIO сохраняют `reverie-image-production_default`.

Read-only HTTP-проверка: Identity ready и OAuth discovery — 200 с прежним issuer;
Production `/api/health/ready`, `/api/health/worker`, `/api/health/pipeline-worker`
— 200. Старый `https://apption.space` — 410, это ожидаемое отключение сайта/Hub.

## Проверки до переключения

1. Stories/Create freeze завершён, общий состав зафиксирован в
   [Production PR #38](https://github.com/mzhoff/image-prodaction/pull/38).
   Перед переключением дождаться полного CI точного итогового commit. Выбрать **один**
   точный артефакт образа из этого CI; Production image здесь ещё не назначен.
2. Сверить конфигурацию нового релиза с защищённым env, не печатая
   `docker compose config` целиком. Допустима валидация `config --quiet`.
   Не заменять рабочие env файлами примеров.
3. Проверить конфигурацию пополнения: в текущем runtime отсутствует
   `REVERIE_BILLING_PUBLIC_CONFIG_FILE`. Итоговый релиз должен явно определить
   поддерживаемый способ пополнения; не объявлять платёжный сценарий готовым
   только по успешному healthcheck.
4. Перед миграциями и переключением сделать свежую согласованную копию и проверить
   её manifest/контрольные суммы; для согласованного snapshot остановить новые
   записи и дождаться завершения активных работ. Identity DB **не очищать**.
5. Не конкурировать с другим deploy. Образы загружать/импортировать из проверенного
   CI на сервер один раз; локальная Docker-сборка и скачивание образов на Mac
   для этого не требуются.

## 1. Identity

Проверенный кандидат:

- image: `reverie-identity:6e1e62c14cec029c89511a467d7413f029955b78`;
- [CI run 35698824623](https://github.com/gigonom/ludimogut/actions/runs/35698824623),
  artifact `identity-image-6e1e62c14cec029c89511a467d7413f029955b78`,
  artifact ID `10681663301`, 457168206 bytes;
- [PR #27](https://github.com/gigonom/ludimogut/pull/27) merged, merge commit
  `e857ce7a5f5992def18c63f81a0ff5dac5a91d42`.

Более новые незакоммиченные локальные изменения Identity не входят в этот образ.
Если scope кандидата изменится, повторить проверки и выбрать новый точный CI-образ.
В репозитории `gigonom/ludimogut` явно установлено `DEPLOY_ENABLED=false`:
старый Hub не должен вернуться из автоматического deploy. Identity workflow
собирает и проверяет образ, но сам сервер не переключает.

После доставки проверенного образа и backup обновить только `IDENTITY_IMAGE`
в защищённой конфигурации. Следующий блок — **будущие команды, не выполнены**:

```bash
cd /opt/reverie-identity
identity_compose=(docker compose -p reverie-identity --env-file .env.production
  -f compose.yaml -f compose.egress.yaml)
"${identity_compose[@]}" config --quiet
"${identity_compose[@]}" run --rm --no-deps migrate
"${identity_compose[@]}" up -d --no-deps identity
```

Это bash-массив. Миграция создаёт недостающую схему нового сервиса в существующей
Identity DB; HTTP-сервер сам её не применяет. Не использовать `down`, `down -v`
или запуск всех сервисов общего старого Compose.

Проверить ready, issuer/S256 discovery, сохранность существующего входа и новые
Telegram embedded/restart контракты. Затем пройти вход реальным пользователем
через Production callback. Старый live-сервис отвечает 404 на новые пути;
поэтому новый Production нельзя переключать раньше совместимого Identity.

## 2. Production

После Identity gate доставить точный образ из итогового зелёного Production CI,
обновить `APP_IMAGE_TAG`, сохранить домен/callback/provider env и файлы overlays.
Существующий Timeweb overlay отключает собственный Caddy и добавляет edge alias;
egress overlay сохраняет provider tunnel. Оба обязательны.

```bash
cd /opt/reverie-image-production
production_compose=(docker compose -p reverie-image-production --env-file .env.production
  -f compose.production.yaml -f compose.timeweb.yaml -f compose.egress.yaml)
# Если внешний S3 уже прошёл отдельные проверки — добавить ПОСЛЕДНИМ:
# production_compose+=(-f compose.storage-s3.yaml)
"${production_compose[@]}" config --quiet
"${production_compose[@]}" run --rm --no-deps migrate
"${production_compose[@]}" up -d --no-deps web worker pipeline-worker
```

Команды приведены для уже подготовленной целевой БД, не выполняют её сброс.
При согласованном запуске Production с чистой БД отдельно подготовить только
её и создать актуальную схему полным набором migrations. Identity и общие
инфраструктурные volumes в этот сценарий не входят.

Готовность после переключения: все три health endpoint; прежние сети/aliases;
вход и возвращение из Telegram; Workspace; загрузка/повторное открытие файла;
вложения ассистента; Stories/Timeline и Canvas; один согласованный сквозной job
с результатом и учётом usage. Затем проверить backup для нового состава данных.

## Внешний S3 — пока отдельный незавершённый gate

В проверенных серверных env и runtime **нет подготовленного внешнего endpoint
и credentials Timeweb S3**: действуют credentials локального MinIO. Это не
проверка личного кабинета Timeweb; пользователь может готовить бакет отдельно.
У web endpoint — локальный контейнер `reverie-image-production-minio-1`,
у workers — `minio`; `CHAT_ATTACHMENT_S3_ENDPOINT` сейчас не задан.

Не включать S3 overlay с незаполненными настройками. После получения защищённой
конфигурации пройти [external-s3-storage.md](./external-s3-storage.md): private
bucket/CORS, probe, доступ из браузера/провайдера, согласование имён bucket в БД,
snapshot/restore. Overlay ставится последним после egress и задаёт одинаковое
хранилище всем трём процессам и вложениям. Старый MinIO автоматически не удаляется.

## Резервные копии

`reverie-beta-backup.timer` enabled/active, ежедневно **03:00 UTC / 06:00 МСК**.
Выполняет `/usr/bin/python3 /opt/reverie-ops/backup.py` с `UMask=0077`.
Последний запуск 22.09.2026 03:00:28 UTC: exit 0, `Result=success`.
Последний завершённый snapshot:
`/opt/reverie-backups/daily/20260922T030028Z`, содержит обе БД, локальное MinIO
и защищённые конфигурации. Обнаружено семь завершённых копий.

Существующая проверка восстановления от 20.09 подтвердила checksum, чтение архивов
и восстановление обеих БД; это не доказательство восстановления нового релиза.
После cutover повторить проверку для свежей копии.

При внешнем S3 заменить только медиа-шаг timer на `storage-backup` с отдельным
backup bucket/operations credentials, сохранив dump Identity/Production и конфиги.
Текущий `backup.py` архивирует локальный MinIO volume и не защищает будущие объекты
внешнего S3. Старые release-образы не обязаны храниться на VPS по решению владельца;
это не разрешение удалить резервные копии пользовательских данных.

В ходе подготовки этого runbook сервисы, env, данные, firewall, Caddy и timer
не менялись; образы не скачивались; платные услуги не создавались.
