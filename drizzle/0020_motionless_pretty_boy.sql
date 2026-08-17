CREATE TABLE "chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"product_id" text NOT NULL,
	"tenant_id" text,
	"user_id" text NOT NULL,
	"storage_ref" text NOT NULL,
	"status" text NOT NULL,
	"declared_mime_type" text,
	"declared_size_bytes" integer NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"pixel_count" integer,
	"frame_count" integer,
	"checksum_sha256" text,
	"failure_code" text,
	"failure_message" text,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_attachments_storage_ref_unique" UNIQUE("storage_ref")
);
--> statement-breakpoint
CREATE TABLE "chat_message_attachments" (
	"message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"purpose" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message_attachments" ADD CONSTRAINT "chat_message_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_attachments" ADD CONSTRAINT "chat_message_attachments_attachment_id_chat_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."chat_attachments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_attachments" ADD CONSTRAINT "chat_message_attachments_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachments_owner_idx" ON "chat_attachments" USING btree ("product_id","tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_status_expires_idx" ON "chat_attachments" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "chat_attachments_checksum_idx" ON "chat_attachments" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_attachments_message_attachment_uq" ON "chat_message_attachments" USING btree ("message_id","attachment_id");--> statement-breakpoint
CREATE INDEX "chat_message_attachments_attachment_idx" ON "chat_message_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "chat_message_attachments_conversation_idx" ON "chat_message_attachments" USING btree ("conversation_id");