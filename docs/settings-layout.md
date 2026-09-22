# Settings layout — 21 September 2026

Profile and Workspace settings share one visual shell in both the intercepted
modal and the standalone settings page.

- Floating surface: 70% opacity, 30 px backdrop blur, 28 px corners. Reduced
  motion disables the entrance animation; reduced transparency uses an opaque
  surface.
- Vertical navigation groups personal settings and Workspace settings. The
  selected item has a filled surface and a blue icon accent. Narrow screens use
  a horizontally scrollable navigation row.
- Content uses a grey well, lighter borderless cards and inset field groups.
  Separation comes from fill, spacing and hierarchy instead of divider lines.
- Buttons, inputs, selectors and the security switch use the published UI core.
  Settings selectors and the theme menu mount inside the modal's focus boundary.
- Short headings and action labels replace repeated explanations. Connection
  metadata is collapsed. Credential confirmations, access restrictions and
  budget-overrun warnings remain visible where they affect a decision.

Routes, Workspace IDs, authorization, API payloads, save behavior and dirty-form
confirmation are unchanged. Opening settings does not change preferences or
issue credentials.

Validation: typecheck, ESLint, architecture and 11 focused settings model/API
tests pass. The repository file-size check reports an unrelated 302-line chat
content file. Browser visual acceptance remains pending: Chrome blocked local
navigation with `ERR_BLOCKED_BY_CLIENT`; the existing Library tab was restored.
