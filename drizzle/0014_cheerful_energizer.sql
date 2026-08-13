CREATE TABLE "chat_agent_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"product_id" text NOT NULL,
	"tenant_id" text,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_scope_key" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"error_code" text,
	"retryable" boolean,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"tenant_id" text,
	"user_id" text,
	"mode" text NOT NULL,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"total_completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost_usd" numeric(18, 8) DEFAULT '0' NOT NULL,
	"last_model" text,
	"last_provider" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_llm_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"request_message_id" text,
	"response_message_id" text,
	"provider" text NOT NULL,
	"provider_connection_id" text,
	"model" text NOT NULL,
	"purpose" text DEFAULT 'assistant' NOT NULL,
	"status" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(18, 8) DEFAULT '0' NOT NULL,
	"latency_ms" integer,
	"error_message" text,
	"error_code" text,
	"retryable" boolean,
	"raw_usage" jsonb,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text,
	"tool_name" text NOT NULL,
	"risk_level" text DEFAULT 'write' NOT NULL,
	"idempotency_key" text,
	"requested_by_product_id" text,
	"requested_by_tenant_id" text,
	"requested_by_user_id" text,
	"provider_tool_call_id" text,
	"agent_resume_status" text,
	"agent_response_message_id" text,
	"agent_resume_error" text,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error_code" text,
	"error_message" text,
	"retryable" boolean,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_agent_turns" ADD CONSTRAINT "chat_agent_turns_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_llm_calls" ADD CONSTRAINT "chat_llm_calls_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agent_turns_request_scope_key" ON "chat_agent_turns" USING btree ("request_scope_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_agent_turns_one_running_per_conversation" ON "chat_agent_turns" USING btree ("conversation_id") WHERE "chat_agent_turns"."status" = 'running';--> statement-breakpoint
CREATE INDEX "chat_agent_turns_owner_idx" ON "chat_agent_turns" USING btree ("product_id","tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_owner_idx" ON "chat_conversations" USING btree ("product_id","tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_updated_at_idx" ON "chat_conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "chat_llm_calls_conversation_idx" ON "chat_llm_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_llm_calls_purpose_idx" ON "chat_llm_calls" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_tool_calls_conversation_idx" ON "chat_tool_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_tool_calls_idempotency_key" ON "chat_tool_calls" USING btree ("conversation_id","idempotency_key");