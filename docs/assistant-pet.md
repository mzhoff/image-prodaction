# Assistant pet

The pet is a presentation layer for the existing assistant. It does not own the
chat, provider balance, generation execution, or document permissions.

As of 2026-09-21, the character is temporarily hidden at the owner's request.
`ASSISTANT_CHARACTER_AVAILABLE` in `assistant-pet-contract.ts` is `false`:
both Canvas and Workspace use the compact button, and character selection is
hidden in settings. Saved presentation preferences, assets, notices, and chat
history are preserved. Re-enabling the flag restores the saved presentation.

## Character contract

`AssistantPetCharacter` has a stable `id`, `name`, an SVG fallback and optional
Lottie files by semantic emotion: `idle`, `hover`, `thinking`, `celebrate`, and
`warning`. Add a character by extending
`src/features/assistant-pet/model/assistant-pet-characters.ts`.

Jitter exports are stored under `public/animations/assistant-pet/<version>/` and
are referenced from the manifest. A Lottie file must have a transparent canvas,
no visible text or controls, and one semantic emotion per file. Copy stays in
the UI so it can be localized and is readable with reduced motion enabled.

Until an emotion has a Lottie export, the launcher uses its SVG fallback and a
small CSS motion. Rover's SVG is rendered inline, so eyes, core and arm can be
animated independently. The fallback is also used when the user prefers reduced motion.

## Notices and document activity

`AssistantNotice` is the shared closed-chat notification contract:

- `title` is required;
- `subtitle` and `status` are optional;
- `nodeId` is a neutral deep-link target, not a callback.

Image and video completion create immutable `document_assistant_event` records.
Each event is also persisted as a normal assistant `ChatMessage` in the
document-bound conversation, using the public ChatModule persistence adapter.
Its stable `document-activity:<event-id>` ID prevents duplicate messages during
backfill or concurrent history loads; its original timestamp keeps the common
chat chronology. Existing event records are backfilled when the chat opens.
There is no separate activity container above the conversation.

New completion requests identify the resulting asset. The server uses it with
the document, user, workspace, kind, and node to identify one completion fact,
so two tabs observing the same result do not create duplicate notifications.
Older requests without an asset ID remain accepted during a rolling update;
historical records without that identity are retained as recorded.

The message's “Открыть ноду” action closes the chat and focuses the source node
on Canvas, including after a reload. Image Production resolves this product
action from the saved message's event/node metadata. No model call is needed to
create a completion message.

Live notifications merge into the same message list without reloading the chat
runtime, interrupting its current answer, or clearing the composer. Same-tab
completion refreshes immediately; other tabs refresh on focus and every 30
seconds while visible. These refreshes do not repeat generation.

Only server-verified workspace members may read or create events. The server
derives user-visible copy from an allow-listed event kind; clients do not submit
arbitrary pet text.

## Preference

The first implementation keeps the presentation (`pet` or `button`) in a
versioned browser preference. It is deliberately separate from document data.
When account preferences are introduced, move only this adapter to a
server-owned user preference; character manifests and event records stay intact.
