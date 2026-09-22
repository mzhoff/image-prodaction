CREATE TABLE "home_chat_conversation" (
  "conversation_id" text PRIMARY KEY REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "home_chat_conversation_owner_idx" ON "home_chat_conversation" ("workspace_id", "user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "home_chat_generation" (
  "id" uuid PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "home_chat_conversation"("conversation_id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "source_turn_id" text NOT NULL,
  "source_message_id" text NOT NULL,
  "tool_call_id" text NOT NULL,
  "input" jsonb NOT NULL,
  "attachments" jsonb NOT NULL,
  "job_id" uuid REFERENCES "generation_job"("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "home_chat_generation_turn_key" ON "home_chat_generation" ("conversation_id", "source_turn_id");
--> statement-breakpoint
CREATE INDEX "home_chat_generation_job_idx" ON "home_chat_generation" ("job_id");
