# Engineering Standards

## Language and naming

- Codebase language: English.
- Type and interface names: PascalCase.
- Variables, functions, hooks, files in TS: camelCase.
- Public API and component names follow existing project style.

## FSD + domain responsibility

Current project layers:

- `app` — application entry and global styles
- `pages` — page composition level
- `widgets` — large composed UI (canvas, navigation, selection)
- `features` — workflow feature behavior (node models + UI behavior)
- `entities` — domain model and store contracts
- `shared` — primitives, utilities, API wrappers

Additional rule:
- shared behavior must be extracted when duplicated across feature areas.
- If two nodes have identical behavior (ports, context handling, text formatting, history integration), factor into shared hook/component.
- FSD imports may point only to the same layer or a lower layer. Cross-slice
  dependencies must go through a stable public contract.

Backend modules use four explicit responsibility zones:

- `contracts` — domain language and stable input/output types
- `core` — pure business rules without Next.js, database or provider code
- `server` — use cases, authorization and orchestration
- `adapters` — PostgreSQL, OpenRouter and other infrastructure integrations

Route handlers translate HTTP only; they do not own business rules or database
queries. Provider adapters do not leak provider-specific payloads into core.

## CSS and visual naming

- Use CSS domain prefixes, not unscoped classes.
- Keep class naming stable with current existing conventions.
- Keep class names aligned with functional domain (e.g., `publication-`, `text-node-`, `graph-edge-`).

## Node/graph vocabulary

- `edge` is a visual canvas artifact.
- `connection` is semantic relation.

## UI state semantics

- Node collapsed state: `Expanded`/`Collapsed`.
- Keep boolean legacy representation only for migration.

## Quality and operations priorities

1. Stability (no data loss, no broken execution state).
2. Visual consistency.
3. Ease of creating/reusing pipelines.
4. Release speed.
5. External trigger integrations.

## Browser support

- Target: Chrome (first stage).

## Lint/checking strategy

- ESLint runs with zero warnings.
- Architecture checks reject upward FSD imports, forbidden backend dependencies
  and import cycles.
- TypeScript implementation files are limited to 300 lines with no baseline
  exceptions.
- CI enforces lint, types, architecture, file size, coverage, database checks,
  production build, smoke tests and browser E2E.
