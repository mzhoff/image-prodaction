CREATE TABLE "video_style_preset" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "name" text NOT NULL,
  "style" jsonb NOT NULL,
  "cover_asset_id" uuid REFERENCES "asset"("id") ON DELETE set null,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "video_style_preset_workspace_updated_idx" ON "video_style_preset" ("workspace_id", "updated_at", "id");
