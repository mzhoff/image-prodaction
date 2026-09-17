# Document previews

My Files and folder cards prefer the saved manual/editor-captured thumbnail asset.
If a document has a saved graph but no thumbnail asset (for example, a Content Hub
starter preset or an API-created file), its DTO exposes a generated graph overview
at `GET /api/projects/:id/thumbnail`. This also covers existing documents without
a backfill, editor visit or paid generation.

The fallback is a bounded SVG overview of saved node positions, titles, text,
contract fields, sections and connections. It does not execute nodes, fetch
external assets, change the graph or add a history entry. It is not a DOM screenshot;
after editor exit, the normal captured preview takes priority, including media.
Empty documents retain the empty state.

The endpoint resolves session identity and document Workspace membership on every
request, before returning the image or `304`. Images are private and must revalidate.
Revision and renderer-version keys invalidate browser previews after graph changes.
User text is XML-escaped; SVG has no external resources or scripts and is served
with a restrictive sandbox CSP and `nosniff`.

Regression checks: `document-overview.test.ts`, `document-dto.test.ts`,
`thumbnail-get-handler.test.ts`, and the existing document lifecycle/validation tests.
