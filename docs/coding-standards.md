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

- Mirror SecuritySphere checks and rules where feasible.
- Before commit: run local checks (no hard CI dependency before public deployment).
- CI enforcement starts after production deployment.
