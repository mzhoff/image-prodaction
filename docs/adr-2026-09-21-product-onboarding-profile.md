# Product onboarding profile

Accepted implementation scope: testable first-user flow requested 21 September 2026.

Production owns questionnaire answers, progress and personal UI preferences in
`user_onboarding`, keyed by the existing product user. Identity remains the owner
of global identity and Telegram/email bindings. The supplied Identity name only
prefills the preferred name; questionnaire edits do not rename the global account.
No workspace, membership, budget or provider setting is derived from the survey.

Existing users are explicitly grandfathered by the additive migration. New users
complete five steps before entering product pages. Auth callbacks and API authorization
keep their current contracts; the questionnaire is a UI entry gate, not an entitlement.
Progress uses revision checks and server validation. Preview mode never writes survey
answers and is identified visibly. Platform-wide profile reuse is a separate API change.

Apply 176f2b5d (21 September): company name is no longer collected, required or
returned to the browser. Old drafts remain readable; new writes normalize this
deprecated field to an empty value, without a bulk deletion of historical rows.
The `other` industry option has a 160-character free-text answer (`industryOther`),
required only when that business context is selected. Completion checks trim text;
valid steps show green checks and remain navigable for editing. Autosave and
revision checks remain active without the distracting success-status label.
