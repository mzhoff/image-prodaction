# Production: состояние пакетов перед выпуском

22 сентября 2026. Пакетные блокеры закрыты. Публичный сервер этим проходом
не переключался; создание Storyboard/Timeline завершено и передано в общий
release gate. Итоговый commit/CI фиксирует весь согласованный состав.
[Production PR #38](https://github.com/mzhoff/image-prodaction/pull/38) содержит
этот состав и окончательные Linux/container checks; перед cutover выбирается
образ только из зелёного CI точного commit.

## Зафиксированная поставка

| Семейство | Версия / источник | Результат |
| --- | --- | --- |
| 14 пакетов ChatModule | exact 0.13.0, GitHub Packages | Опубликованы, скачаны, integrity и consumer API проверены |
| UI Core + Tokens | 0.2.0-canary-reverie-20260910.2 | Прежние опубликованные версии сохранены |
| UI Onboarding | 0.1.0-canary-e7acbb144021425e797c0afdaa51cf99c6747783 | Прежняя опубликованная версия сохранена |
| UI Media | 0.1.0-canary-media.5, GitHub Packages | Локальный file reference заменён exact registry version |
| UI Stories Editor | 0.1.0-canary-stories.6, GitHub Packages | Локальный file reference заменён exact registry version |
| Stories Contracts | 3.0.0-canary.0, архив в Git | SHA-512 и package manifest проверены |
| Identity SDK | 0.1.0-canary.9, архив в Git | Проверен upstream, включён текущий pinned artifact |

Registry-пакеты остаются **private**, лицензия/публичность исходников не меняется.
Identity имеет private:true и поставляется проверенным архивом. Это воспроизводимая
поставка из Git, а не зависимость от соседней папки разработчика. Старые локальные
Identity .5/.7 файлы в релиз не входят.

Source gate проверяет **779 registry records + 2 tracked archives**, manifest/lock,
имя/версию пакетов и SHA-512. CI запускает его до npm ci. Политика ChatModule
по-прежнему требует все 14 пакетов одной точной версии, проверка не отключалась.

## Upstream выпуски

- [ChatModule 0.13.0](https://github.com/PRODactionPRO/ChatModule/releases/tag/v0.13.0):
  [consumer acceptance](./chatmodule-0.13.0-release-acceptance.md). Локализация
  RU/EN подключена к публичному API; будущий harness/recovery backlog не выдаётся
  за выполненную часть этого выпуска.
- UI: [PR #7](https://github.com/PRODactionPRO/prodactionUI/pull/7) merged,
  package source 3ee15be91c5c8a5e77a9109de0ba0424af46c2d1,
  tag production-ui-localization-2026-09-22.
  [Release verification](https://github.com/PRODactionPRO/prodactionUI/actions/runs/35698784661)
  и [main CI](https://github.com/PRODactionPRO/prodactionUI/actions/runs/35699287704)
  success. 338 unit tests, React 18/19, packed и registry Next consumers прошли.
- Identity: [PR #27](https://github.com/gigonom/ludimogut/pull/27) merged,
  main e857ce7a5f5992def18c63f81a0ff5dac5a91d42.
  108 локальных тестов, включая PostgreSQL, без пропусков.
  [CI](https://github.com/gigonom/ludimogut/actions/runs/35698824623) проверил
  standalone image, пустую smoke БД, запуск контейнера и сохранил image artifact
  identity-image-6e1e62c14cec029c89511a467d7413f029955b78 (457168206 bytes).
  Все 31 файла SDK совпадают с Production. Gzip OS-byte различается macOS/Linux;
  сравнивались отдельно checksum архива и одинаковое tar-содержимое. Pinned
  Production TGZ не заменялся другим архивом с тем же номером.

## Вид Production сохранён

Core/Tokens/Onboarding и CSS опубликованных Media/Stories не менялись. Пять
неизвестных PUI references убраны с сохранением прежних вычисленных значений:
локальные роли сохраняют #a6a6a6 и #204aff, clock — прежний secondary, video —
наследование цвета, focus outline — прежний computed initial. Browser regression
сравнивает все пять случаев в light/dark. Оба теста и check:reverie-ui проходят.

## Проверки безопасности и доставки

- Точечный override esbuild 0.25.12 только для legacy core-utils закрывает
  GHSA-67mh-4wv8-2f99. Шесть проверок настоящего установленного loader, CJS/ESM/JSX,
  source maps, Drizzle и CORS прошли без подстановок. npm audit: **0 vulnerabilities**.
- Docker включает public PNG и исключает billing.local.json, секреты, локальные
  Codex/Visual Intent/Playwright-каталоги и отчёты. Локальный backup больше не
  передаёт MinIO password через argv. Legacy deploy не используется новым выпуском.
- Identity repo DEPLOY_ENABLED=false закрепляет отключение старого Hub. После
  merge build/deploy/notify legacy workflow действительно skipped; сервер не менялся.
- Production typecheck, lint, UI/architecture/file-size guards, пакетные проверки
  и диагностическая production build прошли. После freeze creation flow:
  **1535 unit/PostgreSQL tests passed, 0 failed, 23 environment-gated skipped**;
  coverage 79.56% lines / 83.23% branches / 77.82% functions.
- Отдельно все **26 codec tests passed, 0 skipped** (включая 17 real-codec cases):
  FFmpeg/FFprobe 8.0.1, Node 24.15.0, одноразовый контейнер существующего образа
  без сети/доступа к рабочим БД/секретам. На macOS этих бинарников нет; CI
  устанавливает FFmpeg и обязательно включает codec и S3 integration gates.
- Browser auth/storage и chat проходят: полная анкета с resume, private async
  ingest, reset password, Library, создание чата при первой отправке, SSE и
  восстановление document binding. Старые browser fixtures обновлены под
  локализацию, first-visit tours, общий поиск, темы и ingest 202. Все стандартные
  сценарии проверены целевыми прогонами; полный браузерный прогон входит в CI.
- Identity entry проверяется настоящим standalone сервером в отдельном процессе
  с включённым Identity UI, без унаследованных credentials, живой БД или Telegram.
  Три проверки внешнего вида, условий и reduced motion прошли. Работа протокола
  входа проверяется upstream Identity gate и повторяется на сервере после cutover.
- Четыре backend/persistence smoke и отдельный budget concurrency smoke прошли.
  Direct-DB smoke создают собственные временные БД и S3-бакеты с cleanup;
  работающие workers не могут забрать их задания.
- Чистая установка пакетов и обязательный PostgreSQL/S3/codec coverage gate
  прошли также в Linux CI. Старые неиспользуемые архивы исключены из Git и Docker
  context; локальные копии этих файлов не удалялись.

## Следующий серверный шаг

Сначала выкатить проверенный Identity image, сохраняя его БД и issuer
https://id.apption.space/api/auth: текущий сервер ещё не содержит embedded-login
маршрутов. Затем — проверенный общий образ Production из release CI.

Внешнее S3 подготовлено и проверено локально вместе с ChatModule 0.13.0:
[подключение и probe](./external-s3-storage.md). Бакеты/ключи Timeweb и реальный
provider/browser smoke нужны до переключения хранилища; платная услуга здесь
не создавалась. Пустая схема Production допустима по решению владельца, очистка
локальной разработки и Identity не подразумевается.

Детали автоматических проверок: [release-package-gates.md](./release-package-gates.md).
