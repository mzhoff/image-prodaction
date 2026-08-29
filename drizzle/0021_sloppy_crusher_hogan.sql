CREATE TABLE "chat_conversation_events" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"emitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversation_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "chat_support_handoff_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_conversation_id" text,
	"profile_id" text,
	"status" text NOT NULL,
	"requested_by_user_id" text,
	"reason" text,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_agent" jsonb,
	"confirmation_state" text,
	"confirmation_attempt_id" text,
	"confirmation_started_at" timestamp with time zone,
	"confirmation_completed_at" timestamp with time zone,
	"confirmation_failed_at" timestamp with time zone,
	"confirmation_last_error" text,
	"last_error" text,
	"metadata" jsonb,
	"assigned_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_support_message_attachments" (
	"support_message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"purpose" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_support_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"session_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"direction" text NOT NULL,
	"delivery_status" text,
	"delivery_key" text,
	"delivered_at" timestamp with time zone,
	"delivery_failed_at" timestamp with time zone,
	"delivery_last_error" text,
	"author" jsonb NOT NULL,
	"text" text,
	"attachments" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_support_provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"profile_id" text DEFAULT '' NOT NULL,
	"event_id" text NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL,
	"payload" jsonb,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversation_events" ADD CONSTRAINT "chat_conversation_events_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_support_handoff_sessions" ADD CONSTRAINT "chat_support_handoff_sessions_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_support_message_attachments" ADD CONSTRAINT "chat_support_message_attachments_support_message_id_chat_support_messages_id_fk" FOREIGN KEY ("support_message_id") REFERENCES "public"."chat_support_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_support_message_attachments" ADD CONSTRAINT "chat_support_message_attachments_attachment_id_chat_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."chat_attachments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_support_message_attachments" ADD CONSTRAINT "chat_support_message_attachments_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_support_messages" ADD CONSTRAINT "chat_support_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_support_messages" ADD CONSTRAINT "chat_support_messages_session_id_chat_support_handoff_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_support_handoff_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversation_events_conversation_sequence_idx" ON "chat_conversation_events" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "chat_support_sessions_conversation_idx" ON "chat_support_handoff_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_support_sessions_provider_profile_conversation_idx" ON "chat_support_handoff_sessions" USING btree ("provider","profile_id","provider_conversation_id");--> statement-breakpoint
CREATE INDEX "chat_support_sessions_status_updated_idx" ON "chat_support_handoff_sessions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_support_message_attachments_message_attachment_uq" ON "chat_support_message_attachments" USING btree ("support_message_id","attachment_id");--> statement-breakpoint
CREATE INDEX "chat_support_message_attachments_attachment_idx" ON "chat_support_message_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "chat_support_message_attachments_conversation_idx" ON "chat_support_message_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_support_messages_conversation_idx" ON "chat_support_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_support_messages_session_created_idx" ON "chat_support_messages" USING btree ("session_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chat_support_messages_session_provider_message_idx" ON "chat_support_messages" USING btree ("session_id","provider","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_support_messages_session_delivery_key_uq" ON "chat_support_messages" USING btree ("session_id","delivery_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_support_provider_events_identity_uq" ON "chat_support_provider_events" USING btree ("provider","profile_id","event_id");--> statement-breakpoint
CREATE INDEX "chat_support_provider_events_received_idx" ON "chat_support_provider_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "chat_support_provider_events_lease_idx" ON "chat_support_provider_events" USING btree ("status","lease_expires_at");