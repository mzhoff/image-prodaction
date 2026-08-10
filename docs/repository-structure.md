# Repository structure

The frontend follows a lightweight Feature-Sliced Design layout.

```text
src/
  app/styles/                Global CSS owned by the FSD app layer
  app/api-routes/             Route handler logic re-exported by root app/api
  pages/production-editor/    Route-level page composition
  widgets/production-canvas/  Canvas widget, graph interaction and rendering
  features/graph-node/        Node card UI and node-specific behavior
  entities/production-graph/  Graph domain types, store, node definitions
  modules/                     Backend domain modules and provider contracts
  shared/                     Shared API clients, utilities, hooks and UI atoms
```

## Layers

The root-level `app/` directory is the Next.js App Router entrypoint. It is intentionally outside `src/` so that `src/pages` can be used as the canonical Feature-Sliced Design `pages` layer.

The root-level `pages/` directory is intentionally present as a placeholder for the legacy Next.js Pages Router. It prevents Next.js from treating `src/pages` as a Pages Router directory.

`src/app` contains application-level code that is not a framework route entrypoint. For now this is global CSS split by responsibility and API route handler logic.

`pages` contains route-level page composition. FSD page slices live under `src/pages/*` and are imported by root `app/*` route files.

`widgets` contains large composed UI areas. The production canvas owns pan/zoom, selection, drag, clipboard and edge rendering.

`features` contains user-facing feature blocks. Node UI lives here because it combines entity data, OpenRouter actions and controls.

`entities` contains domain state and business rules. For this project it is mainly the production graph: nodes, edges, ports, assets and history.

`modules` contains backend domain boundaries that do not fit frontend FSD:
`provider-connections`, `generation`, `usage`, and `executable-pipelines`.
Each module follows `contracts → core → server/adapters`: contracts describe the
stable language of the domain, core contains business rules, server coordinates
use cases, and adapters integrate PostgreSQL or external providers. Their public
entrypoints keep provider-specific and infrastructure code out of orchestration.
Executable pipeline contracts/core are deliberately independent
from Next.js, PostgreSQL, object storage, provider adapters, and canvas UI so the
runtime can be extracted after the product hypothesis is proven.

`shared` contains reusable low-level pieces: UI atoms, small hooks, API wrappers and file utilities.

## Current Boundaries

- AI routes are thin adapters over Workspace credentials, generation jobs and
  provider contracts.
- The browser never receives a stored raw provider key.
- Long image generation is executed by a separate worker over a PostgreSQL queue.
- `npm run check:architecture` prevents product code from restoring the removed
  global OpenRouter secret, importing upward through FSD layers, creating cycles,
  or bypassing backend module boundaries.
- Canvas interactions are split into hooks under `src/widgets/production-canvas/model`.
- Node renderers are split by node type under `src/features/graph-node/ui/nodes`.
- Global CSS is split by responsibility under `src/app/styles`.

## File Size Rule

Every TypeScript implementation file must stay at or below 300 lines. The
`npm run check:size` gate has no legacy exceptions. Split by responsibility —
contracts, use cases, adapters, handlers, hooks, UI blocks and pure helpers —
instead of moving arbitrary lines into an unrelated file.
