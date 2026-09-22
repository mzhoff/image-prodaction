# Library toolbar and shared media search

Local UI update, 21 September 2026.

The Library header keeps the object count followed by refresh, filters, search and
the Gallery / By date switch. Refresh is an icon-only ghost button, revealed on
header hover or keyboard focus; touch/coarse pointers keep it visible. It retains
an accessible name, tooltip and disabled loading state. The view switch has no
border and uses a darker inactive surface from the existing semantic tokens.

Filter controls are hidden until the filters button is pressed. Active constraints
remain applied when the controls are collapsed, and a badge shows their count.
An applied text query has a removable chip. Existing URL filter and view semantics
are preserved.

Search opens the existing Workspace search dialog in the Media scope. The current
query, origin, media type, model, project and canvas are passed into the dialog.
Library and universal search use the same `LibraryMediaFilters` component and
shared `FilterSelect`, built on the design-system Select. Its popup is hosted in the enclosing native dialog when
present, with collision bounds and Escape handling.

Home now opens this search from an icon in its top-right header. The sidebar search
entry and the initial Home's redundant **New conversation** action are removed.
The explicit new-conversation action remains available inside a conversation;
opening search or switching the Home composer mode does not create a chat.

The search dialog enters over 420 ms from Y +150 px, scale .95 and opacity 0.
Reduced-motion preferences disable the entrance animation. The input has a 65%
surface and 15 px backdrop blur, with a square 44 px filter toggle to its right.
The backdrop behind the search window uses 16 px blur. The small dialog component
is imported with the workspace UI so the first click cannot suspend the parent
layout while downloading a lazy component. Search data is still fetched only
when the dialog mounts; opening it does not replace Home or reset the composer.
Cold-open regression QA used a fresh browser tab with an unsent composer draft:
the first click kept Home mounted with no hidden ancestor, retained the draft,
and opened the native dialog with a computed 16 px backdrop blur. Reopening was
checked as well. The temporary QA tab was closed afterwards.
The **Filters** panel starts collapsed, even when opened with active Library
constraints; the badge retains their count and collapsing does not clear them.

Filtering selectors in Search, Library, Stories, Usage and the sidebar chat list
share 30 px pill triggers. Unselected controls show the filter name inside the
trigger, with no separate label above it. Both triggers and menus use neutral-800
at 80% opacity, white text and 15 px blur. Menu items use 12 px corners inside an
18 px container. A reserved 34 px end column keeps the right-aligned check clear
of the label and facet count. Reduced-transparency preferences use solid surfaces.
Flow constraint chips and Usage period controls use the same surface treatment.

Search filter edits affect the dialog results immediately. **Show in Library**
applies the complete query/filter set to the originating Library without changing
Gallery / By date mode. Closing without applying leaves the Library unchanged.
Both the initial media request and pagination use the same constraints; changed
filters invalidate the prior result key and cancel its request. This adds no new
search backend, media permissions, data migration or paid operation.

## Verification

Search/filter follow-up: typecheck, ESLint, architecture and file-size checks
passed, along with nine focused Workspace search tests. Browser QA confirmed
the Home action, hidden panel with inherited Library constraints, preserved
selection, 44 px input/toggle alignment, 30 px triggers, actual 15 px blur, and
an 8 px gap between option text and the right-hand check. Also checked Stories'
distinct **All projects / No folder** choices, Usage dropdowns/period chips,
Flows chips and the sidebar chat filter. No generation or chat creation was run.
The full token audit still reports four existing references outside this change
(`text-tertiary` in aspect ratio/video/timeline styles and `text-accent` in voice
styles); none are introduced by the shared filter component.

Earlier Library toolbar verification:

- Typecheck, repository ESLint, architecture, file-size and whitespace checks pass.
- Twelve focused tests pass: Library layout/date grouping, Workspace search
  boundaries, filter preservation and outgoing API parameters across pagination.
- Browser checked on authenticated localhost: compact header, collapsed filters,
  custom media selector, active-filter badge, By date state, inherited Video filter
  in universal search, dropdown positioning/Escape, and applying a text query back
  to Library while preserving Video + By date in the URL.
- The selected workspace had no media during browser QA, so visual results were
  checked in their empty/filtered-empty states. No media or workspace was modified.

No deployment was performed.
