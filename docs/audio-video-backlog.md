# Audio/video: deferred product ideas

Decision: 2026-09-06, product owner in the Image Production implementation task.

## Future: author's voice

Not part of the current release. Evaluate a reusable, private author voice profile,
recording/enrollment and verification, explicit consent/revocation, provider eligibility
and commercial rights, Russian pronunciation, quality and measured cost. Candidates
from research: ElevenLabs, Yandex Brand Voice, Qwen self-hosted. No provider selected,
no enrollment, external upload, model training or subscription purchase authorized.

## Future: audio articles / blog audio notes

Not part of the current release. Content Hub/blog owns the editorial workflow,
article revisions, player, publication, subscription and access rules. Image Production
may generate one audio artifact per approved text revision via a pinned capability.
Do not regenerate per listener. Voice choice, verbatim versus edited narration,
review, invalidation after edits, protected delivery and unit economics require a
separate product task. Premium access is an idea, not an approved pricing model.

## Current implementation boundary

Only long Voice production (server split, durable synthesis, join) and universal
Import video (original, video-only, selected audio, playable preview) are authorized
now, in `codex/audio-pipelines`, without deployment. This does not replace the
portfolio's Stories milestone. No voice cloning, blog UI, billing, vocal/music
separation or general video editor is included.
