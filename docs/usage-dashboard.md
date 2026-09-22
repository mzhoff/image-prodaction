# Workspace Usage

`/usage` is a read-only section of the existing Workspace shell. It aggregates
local Image Production generation and ChatModule ledgers and displays the existing
Workspace provider-key balance used by Canvas. It adds no wallet, billing engine
or new platform service. The balance is the key’s remaining budget, not total
OpenRouter account credits.

## Contract and access

- `GET /api/workspaces/:workspaceId/usage?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Europe/Moscow`.
- Session and current server-side membership (`owner`, `admin`, `member`) are
  required on every request. A Workspace UUID alone never grants access.
- Inclusive calendar dates, at most 366 days; API default 30 days. Supported zones:
  `Europe/Moscow` (UTC+3), `UTC`. SQL uses a half-open UTC interval.
- Every SQL source is Workspace-filtered before grouping. Chat calls additionally
  require `product_id = image-production`. No prompts, messages, raw responses,
  credentials or data from other applications sharing an API key are returned.
- The response is `private, no-store`. The browser keys data by Workspace and
  period, aborts superseded requests and unmounts state when switching Workspace.
- Response rows have grain `(day, provider, modelId, category)`. Exact decimal
  strings preserve provider USD and large token counts; nullable values mean
  missing data. Zero requests produces zero totals, not an unknown total.
- Generated time is the snapshot time. Refresh is explicit; filters operate on
  the selected snapshot. Provider reconciliation appears on the next refresh.

## Periods, comparison and chart

- Compact top-left toolbar: Today, Yesterday, Week, Month (UI default), Quarter,
  custom inclusive date range; timezone and chart grain are separate selectors.
- Week is the last 7 days including today. Month/Quarter start 1/3 calendar months
  before today (clamped at month end) and include today. For example, on
  September 21, Week selects September 15–21 and Month selects August 21–September 21.
- The range trigger always displays the selected dates. The shared three-month
  calendar supports two-click ranges, full-month selection (clamped to today),
  month navigation, keyboard arrows/PageUp/PageDown and optional typed dates.
  Future days are disabled; ranges longer than the API's 366-day limit cannot be applied.
- The empty screen retains muted zero-valued cards and a transparent glass illustration.
  Only a confirmed missing/exhausted AI budget shows the existing subscription-sheet CTA.
  A balance error or an empty filtered period does not imply that payment is required.
  Comparison dates/timezone/refresh metadata are no longer shown as a separate status row.
- The API returns `comparison.period`, `comparison.rows`, `currentThrough`,
  `previousThrough`, `partial`, and `available` in addition to the current rows.
  Both reads follow the same membership gate and use the same Workspace ID.
- The preceding range has exactly the same number of days and ends immediately
  before the selected range. Both ranges are clipped to the same elapsed duration
  when the selected range is unfinished. Today at 12:00 compares with yesterday
  up to 12:00, not all of yesterday. Future-only ranges have no comparison.
- Change = `(current - previous) / previous × 100`, rounded to two decimal
  places using integer arithmetic. Category/model filters apply to both windows.
  A zero baseline shows “Ранее 0” or “Без изменений”, never infinity. Missing
  costs/tokens or unconfirmed error outcomes suppress that metric's percentage.
  Expense/request/token growth is neutral, not automatically a positive outcome.
- Line (default) and stacked-bar charts share stable series/colors and a
  day/week/month aggregation. Weeks start Monday; partial edge buckets stay
  within the selected dates. Aggregation changes the chart, not the KPI totals.
- The top five models by requests plus Other are shown as tinted toggle badges
  (`aria-pressed`). Switching a badge recalculates chart scale and tooltip totals,
  without changing the page KPI totals. No-call buckets are zero; wholly unknown
  costs break a line rather than becoming zero. Future buckets are empty.
- Hover, tap or keyboard focus opens a viewport-clamped dark translucent tooltip
  with the bucket date, selected-model expenses and request counts, including
  explicit partial-cost markers. Escape/blur/scroll dismiss it. There is no
  duplicate details row or chart-data table. These are expenses, not a historical
  wallet balance.
- The leading Balance card uses `/api/ai/balance?workspaceId=…` through the same
  shared hook as Canvas. It refreshes every 60 seconds while visible, on focus,
  the existing provider-usage event and manual refresh. Period/category/model
  filters do not affect it; a failed refresh marks the last value as stale.
  An unconfigured key shows zero; an unknown/unlimited remainder shows “—”.
- Cards and operation tiles have no outlines. Model table names, filter options
  and chart labels use the same catalogs as composer/Canvas. The table uses the
  existing publisher logos and groups by model ID, without the provider prefix.
- This extends the dashboard in place without a chart dependency or billing schema.
  Balance reuses the existing read-only provider budget endpoint.

## Measurement definitions

| Metric | Definition |
| --- | --- |
| Requests | Latest `usage_event` per `(generation_job_id, attempt_count)`, plus dispatched jobs without a ledger observation for that attempt, plus individual `chat_llm_calls` |
| Revisions | `call_index` updates one physical call, never increases request count; select latest revision before date filtering |
| Call day | Earliest observation for the attempt, dispatch timestamp for the fallback, or chat call `created_at` |
| Outcomes | Success / failure / no provider confirmation. An unconfirmed dispatch is not presented as a provider success |
| USD | Sum of available costs, including failed calls. Unknown costs are counted explicitly and displayed as a partial sum (`≥`) |
| Average request cost | Exact reported model expenses ÷ all model requests in the filtered period (including failures). Derived on each snapshot/filter change; no stored column. Zero requests or any unknown costs produce “—”, rather than a misleading precise average |
| Tokens | Sum of reported input, output and total tokens; calls with missing fields are counted explicitly. No conversion between media units and tokens |
| Results | Successful generation operations by completion date: image generation/edit/refine/background removal; text generation/formatting; speech generation; video generation |

Results are **successful operations**, not the count of current library files,
frames, speech fragments, or imported assets. Deleting/copying/saving a library
item does not affect the counter. Image analysis, transcription, chat replies,
and local media conversions do not add to generated results. Multiple provider
attempts may produce only one successful operation.

The installed ChatModule 0.12.1 schema defaults missing costs and tokens to zero.
Its historical zero costs and zero token totals are conservatively shown as
unknown; this product projection cannot distinguish a truly free call from
missing telemetry. Improving that distinction requires an upstream normalized
usage contract, not a local fork of the package family.

Historical calls without a ledger entry or dispatch marker cannot be reliably
reconstructed. Separate cache/reasoning counts are not shown because the current
ledgers lack consistent normalized fields. This dashboard never estimates a
provider bill from hard-coded model prices.

## Implementation boundaries

- `src/modules/usage/contracts`: serializable aggregate DTO.
- `src/modules/usage/core`: calendar bounds, exact arithmetic, shared grouping.
- `src/modules/usage/server`: membership gate and parameterized SQL projection.
- `src/pages/usage`: Workspace-bound loading, filters, charts, tables and methods.
- Shared `src/features/provider-budget` loading for Usage and Canvas.
- Thin App Router API/page entrypoints; no schema migration, new provider integration,
  ChatModule package modification or change to existing Workspace ownership.

## Validation

Focused core/service tests run with the normal unit-test loader. The opt-in
`usage-dashboard-postgres.test.ts` accepts `USAGE_TEST_DATABASE_URL` only for a
loopback PostgreSQL database. It rolls back all synthetic fixtures and checks
cross-Workspace isolation in every source, late revisions, real retries,
unknown usage, successful outputs without assets, empty periods and midnight
boundaries. No paid job is queued.

`e2e/usage-dashboard.spec.ts` is opt-in with `USAGE_UI_E2E=1`. It checks real local
session/membership API access with isolated QA accounts, then uses labeled
synthetic browser responses to verify filters, layout and Workspace switching.
Browser fixtures are not financial evidence and are never inserted in ledgers.

### Local verification — 2026-09-12

- Full unit suite: 1012 passed, 11 skipped, no failures (1023 total).
- Focused Usage run with real PostgreSQL: 14 passed, including rolled-back
  two-Workspace fixtures, exact percentages, zero/unknown baselines, leap-day
  presets, equal elapsed cutoffs and lossless day/week/month aggregation.
- Local production browser run: passed. Own Workspace 200/private/no-store;
  foreign member 403 in both directions; anonymous 401; invalid dates/timezone
  400. All five presets, custom-date validation, chart style persistence,
  aggregation, legend toggles, filtered percentages, keyboard chart detail and
  late Workspace response checked. A second run covers the mobile date picker.
- Visually inspected desktop, model/type tables, settled dark theme and narrow
  layouts at 600px / 390px. Screenshots contain labeled synthetic QA data.
- TypeScript, zero-warning ESLint, architecture boundaries and production Docker
  build passed. Existing repository-wide size gate still reports six files
  outside Usage over its 300-line implementation limit; none changed here.
- Existing local Compose services updated with integration/private-package
  overlays; no migration, paid generation or change of runtime secrets.
- All 15 Usage runtime source files match the host. Web and both workers are
  healthy on image `c1a0ae73ffb5`; Content Hub readiness 200, matching Runtime v2
  client, 6 grants and 7 pipelines verified without starting a generation.
- Existing build warning about broad tracing in `video-processor.ts` remains
  outside this Usage change. No dependency versions were changed.

### Local verification — 2026-09-21

- 16 focused core/service/Canvas-budget tests and one transactional PostgreSQL
  test passed. Average-cost coverage includes incomplete prices, zero calls,
  tiny amounts, fractional rounding and values above Number’s integer precision.
- Chromium passed real local membership/API checks and synthetic UI scenarios:
  catalog names/logos, averages, borderless cards, independent balance refresh,
  stale/unknown/disconnected balances, chart badges/selected totals, keyboard and
  cursor tooltips, empty selection, filters and late Workspace response isolation.
- Desktop light/dark and 390px layouts inspected. Tooltip stays inside the
  viewport; keyboard focus survives the browser’s automatic scroll into view.
- Typecheck, zero-warning lint, architecture and file-size checks passed.
  QA accounts are removed after the browser run. No deployment, schema migration
  or paid generation was performed for this change.
