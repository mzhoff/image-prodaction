CREATE TABLE "production_chat" (
  "conversation_id" text PRIMARY KEY REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "folder_id" uuid REFERENCES "studio_folder"("id") ON DELETE SET NULL,
  "title" text,
  "title_source" text NOT NULL DEFAULT 'pending',
  "status" text NOT NULL DEFAULT 'active',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "production_chat_status_check" CHECK ("status" IN ('active', 'archived', 'deleted')),
  CONSTRAINT "production_chat_title_source_check" CHECK ("title_source" IN ('pending', 'intent', 'model', 'user'))
);
--> statement-breakpoint
CREATE INDEX "production_chat_folder_idx" ON "production_chat"("folder_id");
