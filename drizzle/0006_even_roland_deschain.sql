CREATE TYPE "public"."provider_connection_status" AS ENUM('connected', 'invalid', 'disconnected');--> statement-breakpoint
CREATE TABLE "workspace_provider_connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "provider_connection_status" DEFAULT 'disconnected' NOT NULL,
	"provider_metadata" jsonb,
	"last_validated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"disconnected_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_provider_credential" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"encrypted_secret" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"encryption_key_version" text NOT NULL,
	"fingerprint" text NOT NULL,
	"masked_label" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid,
	"generation_job_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_operation_id" text,
	"model_id" text NOT NULL,
	"operation" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"call_index" integer DEFAULT 0 NOT NULL,
	"succeeded" boolean NOT NULL,
	"usage_complete" boolean DEFAULT false NOT NULL,
	"input_tokens" numeric(20, 0),
	"output_tokens" numeric(20, 0),
	"total_tokens" numeric(20, 0),
	"provider_cost_usd" numeric(20, 8),
	"internal_credits_charged" numeric(20, 8),
	"internal_credits_balance_after" numeric(20, 8),
	"error_code" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "request_object_key" text;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "result_object_key" text;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "provider_operation_id" text;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "queue_job_id" text;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "enqueued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "retry_available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_provider_connection" ADD CONSTRAINT "workspace_provider_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_provider_connection" ADD CONSTRAINT "workspace_provider_connection_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_provider_connection" ADD CONSTRAINT "workspace_provider_connection_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_provider_credential" ADD CONSTRAINT "workspace_provider_credential_connection_id_workspace_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."workspace_provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_provider_credential" ADD CONSTRAINT "workspace_provider_credential_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_generation_job_id_generation_job_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_provider_connection_workspace_provider_unique" ON "workspace_provider_connection" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "workspace_provider_connection_status_idx" ON "workspace_provider_connection" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_provider_credential_active_unique" ON "workspace_provider_credential" USING btree ("connection_id") WHERE "workspace_provider_credential"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_provider_credential_connection_created_idx" ON "workspace_provider_credential" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_provider_credential_fingerprint_idx" ON "workspace_provider_credential" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_event_job_attempt_call_unique" ON "usage_event" USING btree ("generation_job_id","attempt_count","call_index");--> statement-breakpoint
CREATE INDEX "usage_event_workspace_occurred_idx" ON "usage_event" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_event_workspace_model_idx" ON "usage_event" USING btree ("workspace_id","model_id");--> statement-breakpoint
CREATE INDEX "usage_event_workspace_operation_idx" ON "usage_event" USING btree ("workspace_id","operation");--> statement-breakpoint
CREATE INDEX "usage_event_provider_operation_idx" ON "usage_event" USING btree ("provider","provider_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_generated_job_unique" ON "asset" USING btree ("generation_job_id") WHERE "asset"."origin" = 'generated' and "asset"."generation_job_id" is not null;--> statement-breakpoint
CREATE INDEX "generation_job_retry_idx" ON "generation_job" USING btree ("status","retry_available_at");--> statement-breakpoint
CREATE INDEX "generation_job_dispatch_idx" ON "generation_job" USING btree ("status","enqueued_at","created_at");--> statement-breakpoint
CREATE INDEX "generation_job_provider_operation_idx" ON "generation_job" USING btree ("provider","provider_operation_id");