CREATE TABLE "document_assistant_event" (
  "id" uuid PRIMARY KEY NOT NULL,
  "document_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "node_id" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_assistant_event" ADD CONSTRAINT "document_assistant_event_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_assistant_event" ADD CONSTRAINT "document_assistant_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_assistant_event" ADD CONSTRAINT "document_assistant_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "document_assistant_event_document_created_idx" ON "document_assistant_event" USING btree ("document_id","created_at");
--> statement-breakpoint
CREATE INDEX "document_assistant_event_workspace_created_idx" ON "document_assistant_event" USING btree ("workspace_id","created_at");
