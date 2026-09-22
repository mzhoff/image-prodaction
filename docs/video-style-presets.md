# Workspace video style library

Video styles are reusable artistic instructions: a catalog look, film grain and a freeform description up to 2,000 characters. They are saved in `video_style_preset`, scoped to an existing Workspace. Creating and applying a preset does not invoke a generation provider or spend credits.

The Home video direction editor can save its current style or apply a preset to the story or a scene/shot override. Applying copies the settings; later edits or deletion of the saved preset do not silently change existing compositions. The Library **Стили** section also supports creation, naming, editing, search and confirmed deletion.

A cover is an optional image chosen from the same Workspace's Library, including existing generated images. The server verifies Workspace, ready status, image media type and library visibility. The cover is only a visual label, not an implicit generation reference. Deleting a preset never deletes its cover asset.

The API is `/api/workspaces/:workspaceId/video-styles` for GET and `/:presetId` for PUT/DELETE. Every operation requires authenticated Workspace membership. Updates and deletion require an expected revision; creation uses revision zero with a stable client-generated UUID, so a repeated request cannot create another copy. Conflicts return an actionable message rather than overwriting a newer version. All members may manage styles in their shared Workspace, consistent with the existing subject library.

Migration `0039_video_style_presets.sql` is additive. The integration test `video-style-preset-postgres.test.ts` runs only when `VIDEO_STYLE_TEST_DATABASE_URL` explicitly points to a local database. It creates temporary users, Workspaces and metadata-only image fixtures, verifies tenant isolation, foreign-cover rejection, revision conflicts and original-image preservation, then removes only those fixtures.
