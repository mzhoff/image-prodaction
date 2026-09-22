CREATE TABLE "home_image_settings" (
  "id" uuid PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "home_chat_conversation"("conversation_id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "settings" jsonb NOT NULL,
  "subjects" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "home_image_settings_owner_idx" ON "home_image_settings" ("workspace_id", "user_id", "conversation_id");
