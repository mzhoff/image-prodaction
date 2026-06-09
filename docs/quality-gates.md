# Quality Gates

## Scope

For MVP front-end scope only (no backend-specific production checks).

## Gate levels

- **Hard gate (must hold):** no data loss, no connector corruption, stable persistence.
- **Soft gate:** UX polish and visual consistency.

## Mandatory checks (local, before commit)

1. `npm run typecheck`
2. unit tests covering critical nodes and graph behavior
3. manual regression pass for publish/canvas core flows

## Critical scenarios (hard)

1. Create node
2. Create and verify connection
3. Remove connection
4. Text generation run + successful text result injection
5. Image generation run + successful image result injection
6. Undo/Redo after rename and move/resize/config actions
7. Text formatting operations in rich text nodes
8. Reorder media blocks in `telegramPublication`
9. Import/export pipeline template
10. Every concrete node type functionality smoke path

## Additional hard constraints

- No silent connector order loss (especially for concatenated and dynamic input nodes).
- Source text and outputs must not disappear on unrelated UI actions.
- Node state must survive reloads (position, ports, collapsed/expanded UI state).
- Runtime should not crash on malformed/partial formatting payload.

## Soft constraints

- Output visual correctness and exact per-pixel similarity are not guaranteed while AI formatting transforms text.
- Minor token-level diff is accepted for LLM formatting operations.
- Rendering polish and spacing should follow current UX backlog.

## Regression budget

When output is produced by AI:

- do not require zero-character diffs from source text;
- require deterministic execution order and stable structural semantics.

## Test coverage matrix by component area

- Canvas graph structure
- Node-level actions
- Publish text formatting
- Sectioning and grouping
- Import/export
- History (undo/redo)

## Delivery rule

Hard gate failures block merge.
Soft gate failures are logged and triaged by priority.
