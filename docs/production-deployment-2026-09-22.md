# Публичный деплой Production — 22 сентября 2026

Production работает на **https://production.apption.space**. Identity обновлён
первым, затем применена схема Production и переключены web и оба worker.
Существующие пользователи, базы, Workspace IDs и медиа сохранены.

## Поставленные артефакты

| Сервис | Исходный commit | Доказательство сборки |
| --- | --- | --- |
| Production web / worker / pipeline-worker | `c0cd2c35559f94398cbde4055e08d342b754cb63` | [main CI 35704759058](https://github.com/mzhoff/image-prodaction/actions/runs/35704759058), [PR 38](https://github.com/mzhoff/image-prodaction/pull/38) |
| Identity | `6e1e62c14cec029c89511a467d7413f029955b78` | [CI 35698824623](https://github.com/gigonom/ludimogut/actions/runs/35698824623), [PR 27](https://github.com/gigonom/ludimogut/pull/27) |

Проверенные CI-архивы доставлены напрямую на VPS без локальной пересборки.
SHA256 ZIP: Production `011a6e8fbee7161924f9170c75407884dc9cdbbd92f7bca2aceb740ca8d70e0e`,
Identity `294598411d16cc06fd61d27ed30ae6d7be8c7c7dd5902ff4fc2d32b636a33b67`.
Docker image IDs: Production `392fc8471ab6932c5efe73f47e2fa4fe953cfd09da7e7a0686a177411862fa57`,
Identity `e28c623e35738271b9270555bec6aa940d7c33299f4b0c808f353cd230f56a5d`.
Отчёт и последующие конфигурационные коммиты не означают пересборку этих образов.

## Повторный запуск на Timeweb

Identity использует прежние `compose.yaml`, `compose.egress.yaml` и защищённый
`.env.production` в `/opt/reverie-identity`. Production — каталог
`/opt/reverie-image-production` и **все четыре overlay по порядку**:

```bash
docker compose -p reverie-image-production --env-file .env.production \
  -f compose.production.yaml -f compose.timeweb.yaml \
  -f compose.egress.yaml -f compose.release.yaml config --quiet
```

Финальный overlay сохранён в [deploy/timeweb/compose.release.yaml](../deploy/timeweb/compose.release.yaml).
Он добавляет MinIO alias `reverie-production-storage` в существующей ingress-сети
`ludimogut` и подключает публичный, не секретный конфиг пополнения к web.
Прежний egress overlay и секреты остаются на сервере; не заменять их примерами.
При следующем обновлении использовать тот же список overlay для `migrate` и `up`.
Не запускать старый полный стек Content Hub и не применять `down -v`.

В общем Caddy заменён только блок Production:
[deploy/timeweb/production.caddy](../deploy/timeweb/production.caddy).
Identity/HTTPS и отключённый сайт `apption.space` сохранены. Caddy перезагружен
через его API без пересоздания соседних сервисов.

## Хранилище и провайдеры

Используется **существующий приватный S3-совместимый MinIO на VPS**. Это не внешнее
объектное хранилище Timeweb: внешнего endpoint/ключей в runtime пока нет.
`CHAT_ATTACHMENT_S3_ENDPOINT=https://production.apption.space`, доставка в модель
`remote-url`. Маршрут бакета в Caddy сохраняет Host/path для подписанных ссылок и
удаляет Cookie; анонимное чтение существующего объекта запрещено.
Внутренние server/worker S3 endpoints продолжают использовать приватную сеть.
Для внешнего бакета остаётся [отдельный проверяемый переход](./external-s3-storage.md).

OpenRouter и Telegram продолжают работать через Amsterdam gateway и защищённый
SSH-туннель. Telegram allowlist расширен только используемыми новым Identity
методами: `sendPhoto`, `editMessageMedia`, `editMessageText`,
`editMessageReplyMarkup`, `deleteMessage`. Перезапущен только gateway.
Существующий бот `reverie_testing_bot` и webhook на `bot.apption.space` сохранены.

`billing.public.json` указывает действующего бота; `transfer: null`.
Реквизиты/курс ручного пополнения не предоставлены и не выдумывались.
Автоматическая оплата YooKassa в этот выпуск не входит.

## Проверки публичного runtime

- Production `/api/health/ready`, `/api/health/worker`, `/api/health/pipeline-worker`
  отвечают 200; оба worker без ошибок цикла, очереди пусты после переключения.
- Identity `/health/live`, `/health/ready`, OAuth discovery/issuer/S256 — успешно.
  Новые embedded/restart endpoint корректно отвергают неверные origin/client/proof.
- Telegram `getMe` подтверждает прежнего бота; webhook без ошибок и ожидающих
  обновлений. Пять новых методов доступны через gateway (проверены заведомо
  недействительным токеном, без отправки сообщений пользователям).
- S3 через публичный HTTPS: PUT/GET, Range, checksum, CORS, sealing, подписанные
  user/model reads и запрет анонимного чтения — успешно. Временные probe objects
  удалены точечно.
- Сквозной API smoke прошёл с двумя собственными временными аккаунтами:
  реальный HTTP sign-in, обязательная анкета, персональные Workspace, durable PNG
  ingest через worker, оригинал/thumbnail/Range, полный prepare/PUT/finalize/read/
  delete цикл вложения ChatModule, запрет доступа второго аккаунта и анонимного
  посетителя, отзыв сессии при sign-out. Тестовые users/Workspace/asset/attachment/
  job и их объекты полностью удалены. Платные AI-вызовы не выполнялись.
- OpenRouter catalogs доступны через сохранённые main/chat proxy URLs из web и
  обоих worker — шесть успешных ответов. Tunnel и ежедневный backup timer активны.
- В Chrome существующая сессия пользователя открыла новый Home и обучающий экран.
  Это подтверждает сохранность сессии; новый полный вход с подтверждением в
  Telegram и платная генерация этим действием не проверялись.

## Данные и восстановление

Перед изменением схем остановлены только процессы записи и MinIO, выполнены
согласованные dumps обеих БД и архивы медиа/защищённой конфигурации.
Snapshot `/opt/reverie-backups/releases/20260922T091014Z`: manifest и SHA256
проверены, gzip/tar полностью прочитаны. Базы и volumes не сбрасывались.
Метаданные фактического релиза: `/opt/reverie-release-artifacts/deployed-release.json`.
Подробные командные логи находятся в защищённом каталоге, а не в Git.

После переключения дополнительно созданы dumps актуальных БД и проверено их
настоящее восстановление в изолированные временные базы: 63 таблицы Production,
19 таблиц Identity. Временные базы удалены. Снимок:
`/opt/reverie-backups/releases/20260922-post-cutover-db`.
Обе копии дополнительно сохранены вне VPS в защищённом локальном каталоге
оператора (права каталогов `700`, файлов `600`); SHA256 повторно совпали.

После всех проверок удалены только два старых неиспользуемых release image и
доставленные ZIP-архивы. Фактически освобождено **4,77 GiB**, свободно **34,11 GiB**.
Работающие образы, контейнеры, volumes, медиа и резервные копии не удалялись.

Дальнейшее подключение внешнего S3 и заполнение платёжных реквизитов являются
отдельными операционными действиями, а не выполненными частями этого деплоя.
