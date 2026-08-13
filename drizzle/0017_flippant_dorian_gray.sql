CREATE TABLE "chat_pipeline_action_proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tool_call_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"document_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"patch" jsonb NOT NULL,
	"safe_preview" jsonb NOT NULL,
	"safe_result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_pipeline_action_proposal" ADD CONSTRAINT "chat_pipeline_action_proposal_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_pipeline_action_proposal" ADD CONSTRAINT "chat_pipeline_action_proposal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_pipeline_action_proposal" ADD CONSTRAINT "chat_pipeline_action_proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_pipeline_action_proposal_tool_call_key" ON "chat_pipeline_action_proposal" USING btree ("tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_pipeline_action_proposal_idempotency_key" ON "chat_pipeline_action_proposal" USING btree ("document_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "chat_pipeline_action_proposal_document_idx" ON "chat_pipeline_action_proposal" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_pipeline_action_proposal_expiry_idx" ON "chat_pipeline_action_proposal" USING btree ("status","expires_at");