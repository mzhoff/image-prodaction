CREATE INDEX IF NOT EXISTS "chat_llm_calls_request_message_idx"
  ON "chat_llm_calls" ("request_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_llm_calls_response_message_idx"
  ON "chat_llm_calls" ("response_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_calls_message_idx"
  ON "chat_tool_calls" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_calls_agent_response_message_idx"
  ON "chat_tool_calls" ("agent_response_message_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_llm_calls_request_message_fkey'
      AND conrelid = 'chat_llm_calls'::regclass
  ) THEN
    ALTER TABLE "chat_llm_calls"
      ADD CONSTRAINT "chat_llm_calls_request_message_fkey"
      FOREIGN KEY ("request_message_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_llm_calls_response_message_fkey'
      AND conrelid = 'chat_llm_calls'::regclass
  ) THEN
    ALTER TABLE "chat_llm_calls"
      ADD CONSTRAINT "chat_llm_calls_response_message_fkey"
      FOREIGN KEY ("response_message_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_tool_calls_message_fkey'
      AND conrelid = 'chat_tool_calls'::regclass
  ) THEN
    ALTER TABLE "chat_tool_calls"
      ADD CONSTRAINT "chat_tool_calls_message_fkey"
      FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_tool_calls_agent_response_message_fkey'
      AND conrelid = 'chat_tool_calls'::regclass
  ) THEN
    ALTER TABLE "chat_tool_calls"
      ADD CONSTRAINT "chat_tool_calls_agent_response_message_fkey"
      FOREIGN KEY ("agent_response_message_id") REFERENCES "chat_messages"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "chat_tool_calls"
  ADD COLUMN IF NOT EXISTS "turn_id" text,
  ADD COLUMN IF NOT EXISTS "context_selectors" jsonb,
  ADD COLUMN IF NOT EXISTS "safe_preview" jsonb,
  ADD COLUMN IF NOT EXISTS "execution_ref" text,
  ADD COLUMN IF NOT EXISTS "concurrency_token" text,
  ADD COLUMN IF NOT EXISTS "presentation_type" text,
  ADD COLUMN IF NOT EXISTS "proposal_expires_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "confirmed_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_calls_turn_idx"
  ON "chat_tool_calls" ("turn_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_tool_calls_status_idx"
  ON "chat_tool_calls" ("status");
