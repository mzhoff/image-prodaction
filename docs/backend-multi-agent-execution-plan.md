# Multi-agent execution plan: backend foundation

Дата: 2026-07-16

Статус: активный рабочий контракт

Основной план: [backend-auth-storage-implementation-plan.md](./backend-auth-storage-implementation-plan.md)

Источник переиспользования: [PR #9](https://github.com/mzhoff/image-prodaction/pull/9), head commit `2facdef5056056a2e255106f1317298e92d3b277`.

## 1. Цель совместной работы

Параллельно реализовать первый backend-контур продукта:

- Better Auth, регистрацию, вход, выход и серверные сессии;
- PostgreSQL, Drizzle и версионируемые миграции;
- Workspace, Membership и Document persistence;
- private S3/MinIO assets;
- подключение существующих auth/workspace/canvas заглушек;
- тесты и минимальный CI/deployment contour.

Главный принцип: переиспользовать проверенные части PR #9, но не переносить старый frontend и модель `User → Pipeline`.

## 2. Git и worktree topology

| Роль | Ветка | Локальный путь |
|---|---|---|
| Интегратор | `backend/integration` | основной репозиторий |
| Auth agent | `backend/auth-sessions` | `Worktrees/auth-sessions` |
| Documents agent | `backend/workspace-documents` | `Worktrees/workspace-documents` |
| Assets agent | `backend/assets-s3` | `Worktrees/assets-s3` |

Все feature-ветки создаются от одного зафиксированного commit ветки `backend/integration`.

Подагенты:

- не переключают ветку внутри своего worktree;
- не выполняют merge/rebase самостоятельно;
- не пушат и не открывают PR без команды интегратора;
- делают небольшие логические commits;
- не редактируют файлы за пределами своей области владения;
- сообщают SHA commit, проверки и известные ограничения.

## 3. Файлы, которыми управляет только интегратор

Подагентам запрещено самостоятельно менять:

- `package.json`;
- `package-lock.json`;
- `.env.example`;
- `compose.yaml`;
- `next.config.ts`;
- общий `src/shared/db/schema/index.ts`;
- Drizzle journal и итоговые SQL migrations;
- `.github/workflows/*` в первой волне;
- этот execution plan.

Если подагенту нужна новая dependency или env variable, он сообщает интегратору точное имя, версию и причину.

Миграции генерируются интегратором после объединения schema modules, чтобы три агента не создали конфликтующие номера и snapshots.

## 4. Общие архитектурные контракты

### 4.1 Runtime

- Next.js 16 App Router;
- Node.js runtime для Better Auth, PostgreSQL и AWS SDK;
- root `app/api/**/route.ts` остаются тонкими re-export handlers;
- application logic живёт в `src/app/api-routes` и domain/application modules;
- client не получает database, S3 или provider credentials.

### 4.2 Identity and tenancy

- Better Auth `user.id` является user identity;
- доступ к продуктовым данным определяется через `membership`;
- Document и Asset принадлежат Workspace;
- `proxy.ts` — первая линия, но не единственная authorization check;
- каждый handler выполняет session и membership check.

### 4.3 Canonical entities

- `Workspace` — пространство пользователя/команды;
- `Membership` — роль пользователя в Workspace;
- `Document` — canvas file;
- текущий URL `projectId` временно равен `document.id`;
- `Pipeline` не создаётся как верхнеуровневая database entity;
- `Asset` хранит metadata и private S3 key;
- graph snapshot хранит `assetId`, а не постоянный public URL.

### 4.4 API errors

```ts
interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}
```

Внутренние stack traces, SQL и S3/provider messages не возвращаются клиенту.

## 5. Первая параллельная волна

### 5.1 Agent `auth_sessions`

#### Результат

Реальная email/password авторизация и серверная session, подключённые к существующим UI-экранам.

#### Область владения

```text
app/api/auth/
src/shared/auth/
src/shared/db/schema/auth.ts
src/features/auth/ или существующий src/pages/auth/
auth-related tests
proxy.ts
```

`proxy.ts` можно менять только этому агенту в первой волне.

#### Переиспользовать из PR #9

- `app/api/auth/[...all]/route.ts`;
- `src/shared/auth/server.ts`;
- `src/shared/auth/client.ts`;
- `src/shared/auth/require-page-session.ts`;
- auth tables из `src/shared/db/schema.ts`;
- идеи `proxy.ts`;
- Better Auth/Drizzle configuration.

#### Реализовать

- auth schema module;
- Better Auth server/client;
- email/password sign-up/sign-in/sign-out;
- подключение controlled fields текущей `AuthPage`;
- pending/error states;
- `requirePageSession()`;
- `requireApiSession()`;
- idempotent personal workspace bootstrap interface;
- public route allowlist;
- защита `/`, `/projects/*` и `/api/*`, кроме auth/health;
- скрытие Google OAuth до feature flag;
- auth unit/integration tests без production email provider.

#### Acceptance criteria

- регистрация создаёт пользователя и session;
- login переживает reload;
- logout закрывает защищённые страницы;
- API без session отвечает 401;
- `/login` и `/register` доступны без session;
- authenticated user не остаётся на auth page;
- tests/typecheck проходят в worktree.

### 5.2 Agent `workspace_documents`

#### Результат

Workspace/Document backend и autosave contracts без зависимости от localStorage как source of truth.

#### Область владения

```text
app/api/projects/
app/api/workspaces/
src/app/api-routes/projects/
src/app/api-routes/workspaces/
src/entities/document/
src/entities/workspace/
src/shared/db/schema/workspace.ts
src/shared/db/schema/document.ts
src/pages/workspace/
document/workspace tests
```

#### Переиспользовать из PR #9

- pipeline CRUD structure;
- UUIDv7 helper contract;
- Zod validation pattern;
- JSONB pipeline config;
- pipeline API client;
- backend sync status/debounce ideas.

#### Реализовать

- Workspace, Membership, Document и DocumentPreference schema modules;
- idempotent personal workspace bootstrap service;
- list/create/read/rename/favorite/trash/restore/delete;
- Document snapshot JSONB;
- `schemaVersion` и integer `revision`;
- atomic revision update и 409 conflict;
- membership-filtered repositories;
- API DTO, совместимые с текущим `ProjectSummary`;
- backend client для `useWorkspaceProjects`;
- autosave adapter/recovery contracts;
- unit/integration tests с mockable session boundary.

#### Acceptance criteria

- пользователь получает только свои Workspace/Documents;
- Document CRUD работает через repository/API;
- trash/restore не удаляют snapshot;
- stale revision не перезаписывает новую;
- malformed/oversized snapshot отклоняется;
- текущий Workspace UI требует минимальных визуальных изменений;
- tests/typecheck проходят после подключения общей auth boundary.

### 5.3 Agent `assets_s3`

#### Результат

Private S3/MinIO assets с проверкой владельца и безопасным lifecycle.

#### Область владения

```text
app/api/assets/
src/app/api-routes/assets/
src/entities/asset/
src/shared/storage/
src/shared/db/schema/asset.ts
asset-related parts of AI route handlers
asset/storage tests
```

#### Переиспользовать из PR #9

- `src/shared/storage/s3-assets.ts`;
- AWS SDK configuration;
- image signature/dimension helpers;
- upload-generated-image flow;
- MinIO-compatible behavior;
- asset client upload/delete ideas.

#### Реализовать

- Asset schema module;
- private bucket adapter;
- storage key через workspace/document/asset ids;
- `pending → ready/failed/deleted` lifecycle;
- upload allowlist и byte limits;
- signature validation;
- signed read URLs;
- delete только по `assetId`;
- membership/ownership interface;
- provider result download с timeout/max bytes/private-network protection;
- orphan cleanup service contract;
- unit/integration tests против MinIO либо mock S3 adapter.

#### Acceptance criteria

- bucket не требует anonymous access;
- клиент не управляет bucket/key;
- пользователь B не читает и не удаляет Asset пользователя A;
- oversized/unsupported upload отклоняется;
- AI image переносится в наше storage до возврата клиенту;
- failed upload оставляет наблюдаемый status и может быть очищен;
- tests/typecheck проходят после подключения общей membership boundary.

## 6. Integration order

Интегратор объединяет результаты в таком порядке:

1. Auth schema и session boundary;
2. Workspace/Membership/Document schema и services;
3. Asset schema и S3 adapter;
4. общий schema index;
5. Drizzle migrations;
6. frontend wiring;
7. полный test/typecheck/build;
8. local Docker integration smoke.

После каждого cherry-pick/merge commit запускаются минимум `typecheck` и релевантные tests. Полный `npm test` и build запускаются после объединения всех трёх потоков.

## 7. Вторая волна

После зелёной интеграции первой волны задачи перераспределяются:

### Auth hardening

- email verification;
- password reset;
- session revocation;
- auth rate limiting;
- trusted origins и cookie policy;
- terms acceptance.

### Local migration and recovery

- обнаружение local projects;
- повторяемый import snapshots;
- IndexedDB asset migration;
- recovery UI;
- conflict E2E.

### DevOps and quality gates

- GitHub Actions;
- PostgreSQL/MinIO integration services;
- standalone Next.js Dockerfile;
- health/live и health/ready;
- staging env contract;
- migration release command;
- structured logging;
- backup/rollback runbook.

## 8. Definition of handoff подагента

Подагент завершает задачу только когда сообщает:

- commit SHA;
- список изменённых файлов;
- что было скопировано из PR #9;
- что было изменено и почему;
- выполненные проверки и их результат;
- известные ограничения;
- необходимые действия интегратора;
- отсутствие изменений вне разрешённой области.

## 9. Cleanup rule

После merge всей backend-работы:

1. убедиться, что integration PR merged в `main`;
2. переключить основной repository на `main`;
3. выполнить fast-forward pull;
4. удалить все три worktree через `git worktree remove`;
5. выполнить `git worktree prune`;
6. удалить локальные feature/integration branches;
7. удалить удалённые feature/integration branches;
8. проверить `git worktree list`;
9. проверить `git status -sb`;
10. оставить одну основную папку репозитория на чистом `main`.

Worktree-папки не сохраняются как архив и не остаются после завершения задачи.
