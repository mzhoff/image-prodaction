# Canvas: palette and assistant surfaces

Local UI refinement, 2026-09-21.

- The assistant launcher uses a compact button while the character is redesigned.
  See [character presentation](./assistant-pet.md).
- Palette and assistant have borderless 24 px outer containers, using the shared
  popup opacity (70%) and backdrop filter (30 px blur). Inner surfaces use 18 px
  corners and a denser secondary fill. Reduced-transparency tokens remain active.
- Tools, Templates and Favorite share borderless cards, with icons to the left
  and a lighter hover surface. Existing icons stay in place until the separate
  illustrated-icon design pass. Node creation, drag payloads and presets are unchanged.
- Palette tabs support arrow keys, Home and End. Closed surfaces are inert.
  The palette is fixed to the viewport so canvas scrolling cannot clip its tabs.
- The existing ChatModule composer is styled through a product CSS adapter.
  Attachments remain above a full-width gray input, with controls below. The
  original auto-sizing, upload, submit, cancellation and recovery handlers remain.
- Header controls use the product tooltip. Keyboard focus stays visible, and
  motion preferences disable panel and card transitions.
- The top-left document header is 384 × 52 px with 18 px corners, 32 px controls
  and 8 × 10 px padding. Its existing narrow-screen width limit remains in place.

Implementation: `canvas-node-palette.css`, `src/shared/assistant/ui/assistant-window-appearance.css`,
`document-node-palette.tsx`, `assistant-shell.tsx`. Window, compact composer and runtime adapters are shared with Timeline and Stories; see [shared assistants](./shared-assistant-windows.md). No ChatModule fork or package change.

Checked locally in the browser: real restored document chat, all three palette
tabs, keyboard switching, multiline input sizing, expand/collapse, settings and
390 px viewport containment. No generation or node creation was triggered.
