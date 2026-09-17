# Reference connections unexpectedly become Style

## Confirmed cause

`normalize-project-edges.ts` unconditionally mapped every target port named
`reference` to `style`. These are distinct current Generate Image ports, so the
mapping changed the role of a user-selected reference rather than migrating an
obsolete identifier. The normalizer runs during local store hydration, document
restore/recovery, portable JSON import and template export/import. It did not
require dragging an edge to another port; the next edit could autosave the
already-retargeted graph.

Read-only inspection of «Карта персонажа», document
`01a07cd4-d8f3-749a-91ff-16ba7af2cdc6`, revision 753, found the three source nodes
«Анфас», «Профиль» and «3/4» connected to a Generate Image `style` input, matching
the report. Other generators in the document had separate `reference` connections.
No production/user snapshot was changed during the repair.

## Repair

- Remove the unconditional `reference -> style` rewrite.
- Keep unrelated legacy aliases: `subject -> actors`, Export `image -> image-0`,
  and the existing renamed source/dynamic ports.
- Preserve intentional Style connections; a saved `style` value alone cannot
  distinguish a deliberate choice from previously corrupted data. No reverse
  migration and no bulk project rewrite. Reconnect affected edges once after the
  client update, then save/reload.
- Live ports and executable compiler contracts are unchanged. Update node help,
  agent guidance and the QA index to distinguish a general reference from style.

## Verification

Four new regression tests failed against the old code and passed after the fix:
individual edge normalization, repeated normalization with three Reference images
and intentional Style inputs, snapshot/template round trips, and store recovery
after editing, collapse and undo/redo. The focused 46-test set also passed.

The browser regression `e2e/reference-port-persistence.spec.ts` uses a separate QA
account/document and three synthetic images. It edits a prompt, collapses and
expands Reference, waits for real autosave, and reloads twice. Paid generation is
blocked by the test. User photos and the user's document are not test fixtures.

Verified after the local rebuild: 786 unit tests passed, 10 skipped; typecheck,
lint and architecture checks passed. The browser regression passed both directly
at localhost:3004 and through Visual Intent at 127.0.0.1:7310, with two reloads in
each run and zero generation requests. Web and both workers are healthy on the
same stable application image. Content Hub internal readiness returned HTTP 200;
its Runtime v2 connection check succeeded with seven grants and five pipelines.
