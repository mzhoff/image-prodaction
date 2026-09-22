# Проверки пакетов перед релизом

Подготовлено 22 сентября 2026. Эти проверки дополняют установку через lockfile,
consumer-тесты и сборку. Они не меняют палитру Production и не публикуют пакеты.

## Источники и доставка

До установки зависимостей:

```sh
node --test scripts/check-release-package-sources.test.mjs
node scripts/check-release-package-sources.mjs
```

Проверка использует только Node, Git и tar; работает без `node_modules` и токенов.
Она проверяет все прямые зависимости и все package records lockfile:

- manifest и корневая запись lockfile согласованы;
- прямые exact-версии соответствуют установленным в lockfile версиям;
- удалённые источники используют HTTPS npmjs/GitHub Packages, содержат правильные
  имя и версию, валидный SHA-512 и не содержат credentials/query parameters;
- `file:` указывает на архив внутри этого репозитория, а не соседнюю папку;
- архив присутствует в Git index, его текущие байты совпадают с индексом;
- SHA-512 архива соответствует lockfile, имя и версия внутри `package.json`
  соответствуют записи пакета.

Согласованный Stories Contracts archive проходит ту же проверку: исключения,
которые игнорируют отсутствие файла или checksum, не нужны. Непоставляемые
UI/Identity archives будут блокировать релиз, пока их не заменят опубликованными
пакетами или не включат согласованный artifact в Git.

Проверка не скачивает registry packages и не считает успешную валидацию URL
доказательством существования пакета или доступа. Авторизованный `npm ci` с
lockfile остаётся обязательным: он проверяет доступ, скачанные bytes и semver
диапазоны. Git/workspace dependencies, aliases и сторонние tarball-hosts требуют
отдельного осмысленного расширения политики с regression tests.

Рекомендуемый npm script:

```json
"check:release-package-sources": "node --test scripts/check-release-package-sources.test.mjs && node scripts/check-release-package-sources.mjs"
```

В CI этот шаг можно поставить после checkout/Node и до приватной установки.
Добавление файла в index — не публикация: релиз должен строиться из коммита,
включающего проверенный manifest, lockfile и все разрешённые archives.

## Совместимость esbuild / Drizzle

На исходном lockfile `npm audit` показывает шесть moderate package entries,
обусловленных одним advisory: `esbuild → @esbuild-kit/core-utils →
@esbuild-kit/esm-loader → drizzle-kit → better-auth → identity-client`.
В этой цепочке старый esbuild — `0.18.20`, ограничение старого core-utils —
`~0.18.20`. При этом Drizzle 0.31.10 для своего актуального TS-config loader уже
использует tsx и esbuild 0.25.12.

[Advisory автора esbuild](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
описывает произвольный CORS-доступ к development server для версий до 0.24.2;
исправление опубликовано с 0.25.0. Это не шесть отдельных дыр в авторизации
Identity. Но устаревший компонент не следует оставлять в релизе только потому,
что штатный Production не запускает его serve API.

Минимальное проверяемое изменение:

```json
"overrides": {
  "@esbuild-kit/core-utils": { "esbuild": "0.25.12" }
}
```

Остальные существующие overrides сохраняются. Глобальный override всех esbuild,
замена всей версии Drizzle или `npm audit fix --force` не нужны. Обновление lockfile
должно действительно убрать вложенный 0.18.20; одного изменения manifest мало.
Если npm оставил старую запись, нужен точечный пересчёт этого subtree и установка,
а не ручное подавление audit или удаление предупреждения из отчёта.

После установки:

```sh
node --test scripts/esbuild-loader-compatibility.test.mjs
npm audit --audit-level=moderate
```

Шесть regression checks проверяют фактически разрешаемую старым core-utils
версию, CJS/ESM/JSX и source maps, legacy loader с отключённым native TS stripping,
Drizzle generate/check для временной схемы без соединения с БД, и отсутствие
wildcard/arbitrary-origin CORS у serve API на локальном fixture-only сервере.
Сервер закрывается, временные файлы удаляются. Тест не открывает исходники проекта
и не меняет существующие миграции.

До применения override тот же suite воспроизведён с временным Node resolution
hook на уже установленный 0.25.12: все шесть checks прошли. Это доказательство
совместимости кандидата; финальный gate запускается без hook на реальном install.
Нулевой audit сам по себе не доказывает поведение — он дополняет эти checks,
обычные тесты Identity/Production и production build.

Финальная проверка 22.09.2026 после фактической установки: все 6 checks прошли
без resolution hooks; `npm audit --json` — 0 vulnerabilities по всем уровням,
781 dependency. UI Media/Stories загружаются из registry, source gate подтверждает
779 registry records и два отслеживаемых архива (Stories Contracts и Identity).
Обе проверки включены в CI, исходники в `scripts/` не полагаются на src-only runner.
