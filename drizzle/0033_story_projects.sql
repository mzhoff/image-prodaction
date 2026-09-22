CREATE TABLE "story_project" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "folder_id" uuid REFERENCES "studio_folder"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "story_project_workspace_updated_idx" ON "story_project" ("workspace_id", "updated_at");
