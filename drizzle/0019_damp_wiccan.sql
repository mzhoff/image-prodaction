CREATE TABLE "chat_agent_turn_events" (
	"id" text PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"request_id" text,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"emitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "attempt_id" text;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "error_category" text;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "execution_state" text;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "latest_event" jsonb;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "original_turn_id" text;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "retry_after_ms" integer;--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD COLUMN "retry_of_turn_id" text;--> statement-breakpoint
ALTER TABLE "chat_agent_turn_events" ADD CONSTRAINT "chat_agent_turn_events_turn_id_chat_agent_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."chat_agent_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agent_turn_events_turn_sequence_key" ON "chat_agent_turn_events" USING btree ("turn_id","sequence");--> statement-breakpoint
CREATE INDEX "chat_agent_turn_events_conversation_emitted_idx" ON "chat_agent_turn_events" USING btree ("conversation_id","emitted_at");--> statement-breakpoint
CREATE INDEX "chat_agent_turn_events_turn_emitted_idx" ON "chat_agent_turn_events" USING btree ("turn_id","emitted_at");--> statement-breakpoint
CREATE INDEX "chat_agent_turns_original_turn_idx" ON "chat_agent_turns" USING btree ("original_turn_id");--> statement-breakpoint
CREATE INDEX "chat_agent_turns_retry_of_turn_idx" ON "chat_agent_turns" USING btree ("retry_of_turn_id");