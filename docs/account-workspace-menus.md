# Account and workspace menus — 21 September 2026

The bottom sidebar button represents the person. The upper product button selects
the product and workspace. This is a navigation change; Workspace IDs, memberships,
server authorization, credentials and billing contracts are unchanged.

## Interaction

- Both menus use a native modal dialog with a full-window backdrop, keyboard focus
  containment, Escape/backdrop dismissal and focus return to the originating button.
- The product panel unfolds from the actual button rectangle. The account panel
  shares the search window's glass style: 24 px corners, a 16 px backdrop blur and
  a 420 ms entrance from 150 px below, 95% scale and zero opacity. Its width is
  1.3 times the button width (minimum 336 px, clamped to the viewport). Its bottom
  edge aligns with the button; the 40 px identity row stays at the bottom. The
  header and identity remain visible while content scrolls on short screens.
  Reduced-motion and reduced-transparency preferences are respected.
- Account menu: existing account/security settings, immediate light/dark/system
  theme buttons using the shared UI provider, RU/EN language buttons, billing entry,
  and existing sign-out behavior. Theme choices have miniature interface previews;
  language and billing controls use the shared dark glass pill style. The English
  beta scope is available in the language button's tooltip. The separate sidebar
  Settings link is removed. Account UI and styles are eagerly imported, so opening
  the menu does not suspend the surrounding workspace on its first click.
- The upper menu has an aligned header: a 132 × 18 px Reverie wordmark,
  shared Workspace-search button and close button. Workspace selection occupies
  its own full-width row immediately below. The sidebar wordmark has no
  workspace subtitle. The panel starts 8 px outward from its trigger, clamped to
  the viewport, with 16 px outer padding and 4 px extra horizontal header inset. The wordmark stays in the
  header grid rather than being translated back to the sidebar button position.
- Products form a two-column card gallery (one column on narrow screens).
  The gallery has its own opaque primary-surface container; the surrounding menu
  uses the shared translucent popup surface (70% opacity, 30 px blur by default).
  Production uses the existing glass Flow mark; Content Hub uses a newly generated
  glass C; Reverie AI uses the existing glass R. Academy retains its academic icon.
  Optional public product URLs enable navigation; missing destinations show Coming
  soon. `NEXT_PUBLIC_REVERIE_AI_URL` joins the existing Content Hub/Academy options.
- The search button closes the ecosystem menu and opens the existing
  `WorkspaceSearchProvider` dialog with all scopes. It does not filter products.
- Workspace selection uses the shared UI Select, with its popup hosted inside the
  native dialog. It marks the active workspace and includes workspace settings.
  Escape first dismisses the dropdown; a second Escape closes the product dialog.
- The workspace trigger has a circular 28 px initial avatar, a 44 px touch target,
  fully rounded ends and no border. Its
  dropdown uses the shared Select and filter-menu styling: dark 86% surface,
  20 px backdrop blur, a soft shadow, inset rounded options and checks on the right.
- Switching workspaces returns to the current collection (Home, Stories, Library,
  Projects, Chats or Usage; Flow editors return to Flows). Old document and chat
  identifiers and query filters are not retained in the destination URL.
- The workspace dropdown includes **New workspace**. It replaces the product
  gallery with a compact name form, focused on opening. Cancel restores the
  gallery and returns focus to the selector. Successful creation inserts the
  returned workspace into the existing navigation state, selects it and opens Home.

## Workspace creation

`POST /api/workspaces` uses the existing product-owned `team` workspace and
membership tables; no schema or canonical-platform migration is introduced.
The server verifies the authenticated session and trusted request origin, validates
a 1–120 character name and a UUIDv7 creation ID, and assigns the session user as
owner in the same database transaction. Client-supplied owner/role fields are rejected.
The form keeps its request ID for retries. Reusing it returns the same workspace
only for the same owner and name; it cannot claim another workspace or restore
revoked ownership. The client disables duplicate submissions and displays failures.
No provider keys, balances or members are copied into the new space.

## Localization and subscription boundaries

Language is a personal browser preference keyed by user ID, independent of workspace,
persisted across refreshes and synchronized across browser tabs. English is explicitly
marked beta: the new account/product menus and sidebar navigation are translated;
the rest of the product has not been fully localized. This is not a server-side
account preference or cross-device synchronization.

There is no account payment/subscription status API in the current integration.
The menu therefore says **Status unavailable** and links to the existing `/account`
bridge. It does not infer paid/unpaid from Workspace AI budgets. That bridge offers
the configured Identity account entry; without Identity configuration it displays
the existing integration-unavailable state. A real paid/unpaid/expiry badge needs
the owning platform service's authenticated contract and agreed subscription model.

This follows the accepted platform direction and the live portfolio decision for a
pilot without subscriptions, using usage payments:
https://app.notion.com/p/3de75415801481ae956ad262feffef09.
No pricing, entitlement or payment behavior is introduced here.

## Verification

Verified after the account glass-style refresh:

- Typecheck, repository ESLint, architecture, file-size and whitespace checks pass.
- Authenticated localhost browser at 1280 × 720: all menu actions fit without
  scrolling; the 40 px identity footer aligns exactly with the originating button.
  The header and footer also stayed fixed during the initial taller-content check.
- The browser applies the 16 px backdrop blur, 30 px glass-surface blur and the
  account entrance animation. Home remains mounted behind the dialog. Escape
  closes the menu and returns focus to the account button.
- Theme/language selections and existing account, security and billing destinations
  remain intact. No personal preference, security setting or subscription was changed.

Verified after the unified product-header adjustment:

- Typecheck, repository ESLint, architecture, file-size and whitespace checks pass.
- Two focused workspace-destination tests pass, including stale story, timeline,
  chat, folder and flow identifiers.
- Authenticated browser checks on localhost: shared header alignment, restored
  sidebar wordmark, custom workspace dropdown with active selection and settings,
  product-search filtering, Escape dismissal and focus return. Opening from the
  collapsed sidebar keeps the full wordmark and the same header layout.
- Workspace IDs and account settings were not changed during browser verification.

Implementation is local; no deployment or production verification was performed.

## Ecosystem gallery verification

- Browser verified at 1280 × 720 and 390 × 844: aligned header, product marks,
  responsive card layout and a workspace menu that stays inside the viewport.
- Computed workspace-menu surface is 86% opaque with `blur(20px)`; selected
  workspace has a right-aligned check. Escape closes the dropdown first, then
  the ecosystem dialog and returns focus to the sidebar logo.
- The ecosystem search action opens the shared Workspace search with its search
  input focused and existing Flow/project/media/storyboard/timeline scopes.
- After the workspace-creation revision, typecheck, ESLint, architecture, size,
  whitespace, three creation-API tests and both workspace-destination tests pass.
  The PostgreSQL test verifies owner membership, retry deduplication, rejection
  of foreign IDs/changed retries/revoked ownership, and rollback on failure.
  All test fixtures are rolled back. Browser verification covers opening the form,
  focus, empty/filled submit state and cancellation; it creates no user workspaces.
- Image provenance and the complete generation prompt: [ecosystem-product-marks.md](ecosystem-product-marks.md).
