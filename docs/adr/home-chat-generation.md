# Home chat generation in Production

21 September 2026. Approved implementation slice: text and one image per user
message, using the existing ChatModule 0.12.1 runtime and Production job worker.

Home conversations have an explicit product-owned binding to user and Workspace,
without a canvas document. A generation proposal is immutable and bound to the
original user turn. The explicit image-composer submission authorizes one job;
replayed signed executions and network retries return the same job. A new message is
required for another paid image. Prompt preparation alone does not spend image
credits. Text mode cannot call image or canvas tools.

The existing job/usage/asset owners remain authoritative. The worker accepts a
documentless image payload with a verified Home provenance marker and publishes
its result into Library. Home only reconciles job state into conversation history;
it never performs provider requests itself or creates a second agent loop.
Read, confirmation and restoration recheck Workspace membership and conversation
ownership. User attachments are resolved from the original message, not model URLs.

## Authorization on explicit image submit

The user's Create/Enter action, with nonblank text, is the authorization for one
image. A new composer request explicitly pins `submitAuthorized: true` inside its
immutable settings snapshot. The server verifies the original textual message,
Home ownership, mode, settings and references before exposing that marker in
`safePreview`. Model tool arguments cannot set this marker. Old settings/proposals
without it retain their ordinary manual confirmation; they are not retroactively
authorized. Attachment-only messages cannot start an image job.

ChatModule 0.12.1 exposes `allowReadWithoutApproval` but no public per-tool
preauthorized-write policy hook. Paid generation remains `riskLevel: write`.
The product consumes only marked Home tools through public
`runtime.confirmToolCall`, after the current stream settles. The package verifies
its normal signed approval and claims tool execution atomically. A per-tool client
guard prevents render/reconnect loops; a failed response exposes a retry that
reloads and reconciles the same tool, never resubmitting the user message. Existing
server source-turn/job idempotency remains authoritative across tabs and reloads.
Canvas and other product tools retain their confirmation policy.

Stopping the chat first marks current Home proposals as canceled locally and
rejects them through `runtime.rejectToolCall`, then cancels the stream. A failed
Stop retries rejection rather than confirmation. A signed execution already sent
is not claimed to be canceled; the resulting durable job retains its own cancel
action.

An upstream public preauthorized-write policy is desired to remove this product
adapter. No package is patched and no paid tool is relabeled as read-only.

GET `/api/chat/v1/home-conversation` restores the latest session and jobs; POST
creates a fresh session without deleting history, assets or running jobs. Both use
the existing session and `x-workspace-id`. GET may select an older owned session
with `conversationId`. Chat traffic keeps existing REST/SSE endpoints and uses
`general-chat` or `image-generation`, with context `{route:'/'}`.

## Composer parameters and Library subjects

The composer POSTs an immutable snapshot to `/api/chat/v1/home-image-settings`
before submitting its message. Input: `conversationId`, `model`, `aspectRatio`,
`size`, `subjectIds` (up to three), optional `uploadedReferenceCount` (0–3, a
preflight hint only), and `submitAuthorized: true` on explicit image submit.
Response includes `settingsId`. The public
ChatModule `runtime.setContext` carries `{route:'/', entity:{type:
'home-image-settings', id:settingsId}}`; ChatModule persists this selector in the
original message. No custom transport field or modified ChatModule package.

The snapshot pins model, ratio and size regardless of LLM tool arguments. It also
pins the passport/revision and first imageAssetId of each subject (description-only
subjects are valid). All user attachments remain selected. Up to four images total
and the selected model's stricter limits are validated; references are never
silently dropped. Subject/workspace membership and original image checksum are
checked again on execution. Changes to Library after confirmation do not alter the
pinned passport or cause a second paid request. Legacy messages without a selector
continue using the existing tool defaults. Migration 0036 adds the immutable
settings table; existing generation proposal JSON stores the resolved snapshot.
