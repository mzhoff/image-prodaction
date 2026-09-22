# Onboarding analytics, 22 September 2026

Approved scope: measure entry, Telegram confirmation, questionnaire, guided tour,
first product actions and balance top-up. Identity remains the authentication and
payment owner; analytics cannot grant access or change balances.

Browser events use the existing Metrica counter and a strict parameter allowlist.
Anonymous login is measurable. Workspace/Telegram identifiers, names, free-text
answers, prompts, receipt contents, errors, deep links and query strings are excluded.
The 22 September follow-up explicitly adds an internal product UserID and a bounded
projection of completed questionnaire categories (see below).
Metrica ClientID is optional attribution only; it is never authentication proof.
Missing/blocked analytics must not prevent login or payment.

The shared Identity SDK transports optional ClientID attribution to Identity.
Identity records bot milestones with their business transitions, then a separate
bounded worker delivers them through Measurement Protocol. Persistent event keys
prevent repeated webhook callbacks and worker restarts from creating new events.
Network ambiguity can still duplicate a delivered hit: Measurement Protocol does
not promise exactly-once delivery. Completed database transitions are authoritative.

Production allowlists and separate off/debug/live modes apply to both transports.
Local traffic never enters the production counter. The Measurement Protocol token
is server-only. Events older than its 12-hour ingestion window expire visibly in
the queue rather than being relabelled as current activity.

Questionnaire timing has two measures: wall-clock elapsed time (including returns)
and foreground active time. Refresh restores the session timer; foreground time
excludes hidden tabs and gaps after closing the document. Timing is per browser
session, not a cross-device claim. Goal payloads contain numbered steps and durations; categorical audience enrichment
is a separate, server-authorized projection.

References: [Measurement Protocol](https://yandex.ru/dev/metrika/ru/data-import/measurement-upload),
[server configuration](https://yandex.ru/dev/metrika/ru/data-import/manage-protocol).

## Funnel and reporting

`ip_login_viewed → ip_login_method_clicked → ip_telegram_open_clicked →
ip_bot_login_started → ip_bot_login_approved → ip_login_succeeded →
ip_questionnaire_completed → ip_app_opened → ip_generation_requested`.

The questionnaire and tour are separate: five form steps and six Home guide steps.
`ip_questionnaire_step_viewed/completed` carry `step` (1–5). Validation/save failures
and backwards navigation are separate goals. `ip_tour_step_viewed` carries a numbered
step; `section` distinguishes Home and other guides. Skip is not completion.
`ip_app_opened` fires only inside the product, after the required questionnaire.
Its `elapsed_ms`, when a login start exists in this browser session, measures the
whole path from entry. Other timing parameters describe the current journey/step.

`ip_topup_clicked` has a placement `source`: profile_menu, usage_header,
usage_empty, canvas_balance, provider_settings, ai_access_dialog, ai_access_banner.
Use this goal for placement comparisons, not a sum of every subsequent top-up goal.
Follow with `ip_topup_viewed → ip_topup_instructions_viewed →
ip_topup_handoff_created → ip_bot_topup_opened → ip_bot_receipt_received →
ip_payment_approved → ip_balance_credited`. Preset/custom choice and amount are
parameters, not receipts. Bot-native entry is `ip_bot_topup_clicked`; it uses the
last successfully bound ClientID for that same user, valid for up to 30 days.
Without ClientID (ad blocker, bot-first arrival) a web-linked hit is not fabricated.

Compare unique users/conversions, not event totals: retries, revisiting steps and
new top-ups are legitimate repeated actions. Analyse `elapsed_ms` and `active_ms`
separately; background waiting is part of elapsed time, not active time. Session
storage does not join devices/tabs or survive all browser privacy modes. A delayed
bot event can start a new visit for the same ClientID; use a user-level funnel with
an appropriate time window, rather than requiring all steps in one visit.

## Saved activation dashboard

[Первый пользовательский путь](https://metrika.yandex.ru/dashboard?id=112833712&dashboardId=b5039dde-1f07-47c2-b6c7-e316f70b876e)
contains five verified widgets: the two existing product-action widgets plus:

- [Entry → generation request](https://metrika.yandex.ru/stat/281cf1dc-07c4-4a7a-a097-d30469b841fe?id=112833712): login view, successful login, completed questionnaire, app opened, generation requested.
- [Telegram → questionnaire](https://metrika.yandex.ru/stat/7f4fae53-d497-43cc-9323-f13eaac80378?id=112833712): login method selected, Telegram link clicked, bot started, login approved, returned to product, questionnaire completed.
- [Website top-up → credited](https://metrika.yandex.ru/stat/6a05acf4-be7a-4722-88ec-0894595e6206?id=112833712): top-up click, amount screen, instructions, handoff, bot opened, receipt, approved, credited.

All three use a seven-day user/event window. Activation describes new onboarding;
existing users who have already completed it need not pass the questionnaire again.
A generation request is not proof of a successful generated asset. The Telegram
funnel begins with selection of any login method, so its first-stage denominator
also includes people who selected email. Top-up does not require changing the
preset amount. Bot-native top-up starts separately and is not a website conversion.

## Decision: backend audience projection and scoped replay

Approved follow-up, 22 September: identify internal accounts and compare questionnaire
segments. Ownership remains in Product/Identity; Metrica receives a read-only projection.
`GET /api/account/analytics-profile` resolves the authenticated user on the server,
ignores any caller-supplied user ID and responds with `private, no-store`.

The browser uses `setUserID('ip_<product-user-id>')` and `userParams({UserID,
reverie: ...})`. This is a pseudonymous identifier, not a promise of anonymization.
It can be joined to the local `user.id` in our database by removing the `ip_` prefix.
No names, contacts, exact birthdays, company names or arbitrary text are sent.
Allowed scalar traits: age group, role, work type, team size, industry, AI experience,
agent experience and automation level. Known goals/tasks/tools are yes/no flags.
Incomplete questionnaires use `unknown`, with a separate onboarding status.
A second browser allowlist rejects unexpected fields and values.

Visitor parameters reflect the latest profile and can affect historical visits.
A separate `params({audience: ...})` snapshot is sent for visit-level comparisons;
it is not a complete history of every profile change. No backfill or bulk export
of existing accounts is performed. Enrichment failure never blocks product events.
ClientID joins browser and bot events; UserID improves internal-account lookup.
A shared browser, denied analytics or missing ClientID still limit attribution.

28 API segments are saved in `deploy/analytics/activation-segments.json`: completion,
roles, age groups, AI experience, selected tasks and behavioral milestones. The
API expressions were accepted by Reporting API; there is no live matching traffic yet.
API segments are not automatically displayed in the UI's saved-segment picker.
23 corresponding questionnaire segments were therefore also saved through the UI
and verified in its picker (completion, eight roles, six age groups, four AI levels,
four tasks). Choose `Сегмент → REVERIE · …` inside a funnel/report. The five
behavioral segments remain available through the API expressions; goal-based
filters are also available in the ordinary report UI.

Counter Webvisor is enabled, with form recording disabled (`wv_forms=0`). In code,
replay is enabled only on `/onboarding` without query/hash. The body is masked by
default; only the questionnaire's static interface is unmasked. Free-text fields
and errors remain masked and keystroke recording is disabled. Navigating to any
other screen destroys the recording instance and initializes event-only tracking.
Chats, editors, login and source materials are not recorded. Public masking and
actual replay delivery must be verified after deployment before expanding this scope.

Sources: [UserID](https://yandex.ru/support/metrica/ru/objects/set-user-id),
[visitor parameters and personal data](https://yandex.ru/support/metrica/ru/data/user-params-data),
[Webvisor masking](https://www.yandex.ru/support/metrica/ru/webvisor/settings).

## Delivery status

22 September: 37 new goals created and read back; 46 total (37 browser, 9 server).
Measurement Protocol enabled and checked. Token stored outside Git, mode 0600,
in `~/Library/Application Support/Reverie/analytics/production.env`.
Production code has not been deployed by this task. No synthetic hits sent to the
live counter. The registry's `analyticsStartedAt` remains unset until a real public
pass is observed in Metrica. Goal existence and HTTP 200 are not reporting proof.

Deploy Identity schema before code: optional private user/challenge attribution,
bot milestone timestamps, handoff attribution, request applied timestamp and a
separate delivery queue. Existing balances, sessions and identities are preserved.
Load the protected analytics env into Identity's `.env.production`; browser receives
only its existing public counter config. Identity requires `NODE_ENV=production`
for live transport. Local profile remains off/debug. Check pending/expired queue
counts and endpoint availability without logging tokens or payloads.

## Verification performed

- 23 Image Production tests: payload/route privacy, async initial-view delivery,
  no direct personal data leakage, bounded queues, questionnaire clocks, billing API and registry.
- 75 Identity tests passed with an isolated PostgreSQL database (3 unrelated
  database suites skipped); bot replay, optional attribution, payment milestones,
  retry/backoff, worker restart and expiry included. Test DB removed afterwards.
- Shared SDK canary.9: 9 tests passed; built archive installed and compared with
  upstream dist. Both product and Identity typechecks pass. Product lint and
  architecture pass. Identity/SDK lint exits successfully; pre-existing Identity
  test warnings remain. Repository-wide Content Hub architecture is still blocked
  by the pre-existing publications component size (626 > 600 lines).
- Browser debug: anonymous view, Telegram selection/challenge, product opened,
  top-up source profile_menu, amount and instructions. The top-up view is emitted
  once by the sheet, independent of loading the selected Workspace.
- Local optional columns/queue migrated in one transaction; user/session counts
  and total credits/applied budgets unchanged. Identity/web restarted; readiness
  and Content Hub → Production Runtime v2 connection checked successfully.
- Browser session refresh returned an existing 429 during inspection. Anonymous
  analytics now uses the server-authorized page and does not depend on that extra
  request. A full personal registration and live payment were not performed.
- Docker images/container counts unchanged; no Docker build or volume cleanup.
  Private production secret is outside Git. Public event delivery is not yet proven.

Follow-up checks: audience allowlists, account-switch/logout isolation, SDK readiness
and scoped replay are covered by focused tests. Counter settings and all five
activation dashboard widgets were read back on 22 September.

Final follow-up validation: 27 focused analytics/release tests passed, followed by
TypeScript, ESLint and architecture checks (2090 source files); `git diff --check`
passed. Anonymous HTTP access to the new endpoint returned 401. Authenticated
browser readback was not completed: Chrome blocked the analytics-profile URL
with ERR_BLOCKED_BY_CLIENT. The blocker was not bypassed. Profile enrichment
remains optional and is covered by allowlist/engine tests; actual authorized
profile delivery and Webvisor masking need public post-deploy verification.
