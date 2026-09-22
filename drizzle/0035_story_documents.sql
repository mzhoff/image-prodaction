CREATE TABLE "story_timeline" (
 "id" uuid PRIMARY KEY NOT NULL,
 "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
 "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
 "folder_id" uuid REFERENCES "studio_folder"("id") ON DELETE SET NULL,
 "storyboard_id" uuid REFERENCES "story_project"("id") ON DELETE SET NULL,
 "name" text NOT NULL, "snapshot" jsonb NOT NULL,
 "revision" integer DEFAULT 0 NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "story_timeline_workspace_updated_idx" ON "story_timeline" ("workspace_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "story_timeline_storyboard_idx" ON "story_timeline" ("storyboard_id");
--> statement-breakpoint
CREATE TABLE "story_v1_migration_backup" (
 "storyboard_id" uuid PRIMARY KEY REFERENCES "story_project"("id") ON DELETE CASCADE,
 "snapshot" jsonb NOT NULL, "revision" integer NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "story_v1_migration_backup" ("storyboard_id", "snapshot", "revision")
 SELECT id, snapshot, revision FROM story_project WHERE snapshot->>'schemaVersion' = '1';
--> statement-breakpoint
INSERT INTO "story_timeline" (id, workspace_id, created_by_user_id, folder_id, storyboard_id, name, snapshot, created_at, updated_at)
 SELECT id, workspace_id, created_by_user_id, folder_id, id, name || ' · Монтаж',
 jsonb_build_object('schemaVersion', 1, 'aspectRatio', snapshot->'settings'->>'aspectRatio', 'clips', snapshot->'timeline'->'clips'), created_at, updated_at
 FROM story_project WHERE snapshot->>'schemaVersion' = '1' AND jsonb_array_length(COALESCE(snapshot->'timeline'->'clips', '[]'::jsonb)) > 0;
--> statement-breakpoint
UPDATE story_project SET snapshot = jsonb_set(snapshot - 'timeline', '{schemaVersion}', '2'), revision = revision + 1
 WHERE snapshot->>'schemaVersion' = '1';
--> statement-breakpoint
CREATE TABLE "story_chat_conversation" (
 "conversation_id" text PRIMARY KEY REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
 "storyboard_id" uuid NOT NULL REFERENCES "story_project"("id") ON DELETE CASCADE,
 "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
 UNIQUE("storyboard_id", "user_id")
);
