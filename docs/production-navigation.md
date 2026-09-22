# Production navigation

Local implementation of the approved [Figma navigation, 737:8954](https://www.figma.com/design/UA1XIcYdD0DUr5gPCSGUQm/REVERIE-img-prodaction-pipeline?node-id=737-8954), 2026-09-20; Home/Flows/project update 2026-09-21.

The user's explicit adjustment to the mock is that My media belongs inside Library.
This is a navigation change, with no Workspace, membership, ownership or data migration.

| Entry | Destination and behavior |
| --- | --- |
| REVERIE logo | Anchored ecosystem dialog; products, workspace dropdown and product search in one header; Escape/backdrop dismissal |
| Home | `/`, quick chat and Library references; document cards open `/create?type=…` with inline configuration and creation on first Send ([contract](./production-create-flow.md)) |
| Flows | `/flows`, editable documents and the existing templates/tutorial band; `/pipelines`, published pipelines. The Playground button follows Help in the shared Flows header, outside the mode tabs. |
| Playground | `/playground`, separate testing viewport with its own title, a back link to `/flows`, and compact icon navigation (57 px by default). Expanding its sidebar does not change the menu preference of other sections. |
| Library | `/library`, images and videos; `section=subjects`, characters; `section=pipelines`, saved reusable flows; `section=projects`, project media |
| Stories | `/stories`; storyboard and timeline views of a saved story project, implemented in the coordinated Stories task |
| Community | Visible as coming soon, following the mock |
| Projects | Collapsible current Workspace folder tree and New project; folders link to `/folders/:id` with Flow, story and media contents |
| Chats | Collapsible recent conversations, archive/trash filter, New chat and incremental Show more |
| Usage | `/usage`, anchored at the bottom of the sidebar |
| Profile | Anchored personal account dialog; account/security settings, quick theme and language, subscription status availability and sign out. The separate Settings sidebar link is removed. |

Workspace settings are reached from the workspace section of the upper ecosystem
dialog. Existing settings routes (including Trash) remain available. Details and
the verification boundary of the account-menu update are in
[Account and workspace menus](./account-workspace-menus.md).

The expanded sidebar is 245px, compact is 57px. Navigation icons in
`public/navigation` are SVG exports from the supplied Figma node. The logo reuses
the existing wordmark; compact mode displays its RE part. Light navigation colors
match the supplied design; dark mode uses the shared theme's semantic tokens.

Future styles, avatars and other presets belong in Library. No empty storage
features or new entitlement behavior are implied by this navigation work.

## Other products

Optional public URL configuration: `NEXT_PUBLIC_CONTENT_HUB_URL` and
`NEXT_PUBLIC_ACADEMY_URL`. Configure each to the real available product URL for
the relevant environment. Without a URL its card stays unavailable (Скоро).
Production uses a same-origin link. Cross-product navigation does not copy
Workspace IDs, auth tokens, or private context into URLs.

## Compatibility and verification

- Existing document URLs, `/pipelines`, `/playground`, `/trash`, and old folder links remain valid.
- Workspace selection uses the existing server-authorized Workspace list. Switching
  clears the previous Workspace's folder/document filters and keeps the active Home, Flows, Library, Stories or Projects section.
- `/flows` is a recognized analytics screen; folder IDs and search terms are stripped from hits.
- Local browser checks: Flows and published tabs, filtered Flows URL, Library and
  saved flows, compact menu and keyboard expansion, profile and Workspace picker,
  intercepted settings and Trash dismissal.
- Typecheck, lint, architecture, file size and focused analytics tests pass.
- `check:reverie-ui` reports pre-existing missing tokens outside this change:
  `--pui-semantic-text-tertiary` in aspect-ratio-selector, generate-video-node and
  timeline-media CSS; `--pui-semantic-text-accent` in voice-selector CSS.

This change is local and has not been deployed.

## Sidebar collections — 21 September 2026

- Projects and Chats use matching disclosure headings: text on the left, a chevron
  immediately after it, and right-aligned 28 × 28 px toolbar buttons spaced 4 px
  apart. The chat filter uses the same transparent trigger as the other navigation
  tools, while its menu retains the shared dark filter style.
- Heading actions appear on hover over their own collection or keyboard-visible
  focus within its heading. Mouse focus retained after expanding/collapsing a group
  or an open filter does not keep them visible after the pointer leaves. Touch
  devices keep the actions visible; reduced-motion preferences disable their fade.
- Toolbar, disclosure and folder icons share the navigation icon color. An active
  chat filter uses a subtle background rather than a different icon color. New
  project, Chat filter and New chat use the shared ProTooltip without native title
  hints.
- Hover-control verification: browser checks confirm resting/hover visibility,
  keyboard access and branded tooltips. The expand/collapse regression is checked
  by moving the pointer out without clicking elsewhere or clearing focus.
  Typecheck, lint and architecture checks pass.
- The two collections flow vertically without stretching into unused space. Empty
  or collapsed Projects leave Chats immediately below. Long lists scroll together;
  the top navigation and bottom account/usage controls stay available.
- Folder objects already live in the Workspace shell's snapshot. Collapsing Projects
  preserves its tree, drafts and loaded data; collapsing the whole sidebar preserves
  both collection components and their open states.
- Projects and Chats disclosure choices persist independently in versioned browser
  localStorage and restore after reload or remount. Each click saves immediately;
  another tab receives the updated preference. These are browser-wide UI choices,
  not account settings or chat data. Both groups default to expanded on first use;
  blocked storage falls back to the current page session.
- Local browser verification confirms independent restoration of both groups after
  reload, cross-tab updates and continued interaction when storage writes fail.
- Chat summaries are cached in memory for the signed-in UI session, separated by
  workspace, folder, status, search and page size. The provider replaces its cache
  when the signed-in user changes. No chat contents are written to localStorage.
- The first sidebar page loads 5 chats; Show more requests up to 10 additional rows
  and appends them. Reopening a group, revisiting a cached filter and route/window
  focus changes do not refetch. Concurrent readers share a pending request.
- Successful chat mutations and completed assistant turns invalidate affected
  workspace lists. Visible lists refresh while retaining the loaded window; closed
  lists retain their snapshot and refresh when next opened. A failed additional
  page preserves earlier rows and its offset; older in-flight responses cannot
  overwrite data refreshed after a mutation.
- Local verification: six focused cache tests, typecheck, lint, architecture and
  file-size checks pass. At 1280 × 720, browser checks confirm button geometry,
  disclosure placement, empty/collapsed Projects, opening/cancelling New project,
  chat pagination from 5 to 8 rows, returning from archive, and preserving all 8
  rows with no loading state after collapsing Chats or the whole sidebar.

## Next design direction — 21 September 2026

Home now opens a fullscreen conversation; the existing file gallery and template
band live in Flows. The sidebar and main surface have an inset rounded border, with
a translucent sidebar. Legacy Home file-filter URLs redirect to Flows; old Flow
editor URLs remain unchanged. See [interface principles](./reverie-interface-principles.md),
[Home implementation](./home-assistant-experience.md) and
[project containers](./project-containers.md).
