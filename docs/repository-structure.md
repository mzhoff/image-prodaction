# Repository structure

The frontend follows a lightweight Feature-Sliced Design layout.

```text
src/
  app/                       Next.js app router, API routes and global styles
  entities/production-graph/  Graph domain types, store, node definitions
  features/graph-node/        Node card UI and node-specific behavior
  shared/                     Shared API clients, utilities, hooks and UI atoms
  views/production-editor/    Page-level composition
  widgets/production-canvas/  Canvas widget, graph interaction and rendering
```

## Layers

`app` contains framework-level code: routes, API handlers and global CSS imports.

`entities` contains domain state and business rules. For this project it is mainly the production graph: nodes, edges, ports, assets and history.

`features` contains user-facing feature blocks. Node UI lives here because it combines entity data, OpenRouter actions and controls.

`widgets` contains large composed UI areas. The production canvas owns pan/zoom, selection, drag, clipboard and edge rendering.

`shared` contains reusable low-level pieces: UI atoms, small hooks, API wrappers and file utilities.

## Current Boundaries

- OpenRouter calls are made through `src/app/api/ai/*` route handlers.
- The browser never receives `OPENROUTER_API_KEY`.
- Canvas interactions are split into hooks under `src/widgets/production-canvas/model`.
- Node renderers are split by node type under `src/features/graph-node/ui/nodes`.
- Global CSS is split by responsibility under `src/app/styles`.

## File Size Rule

Keep implementation files under 300 lines when practical. If a file grows beyond that, split by responsibility first, not by arbitrary line count.
