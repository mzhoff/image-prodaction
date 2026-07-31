CREATE TYPE "public"."executable_pipeline_status" AS ENUM('draft', 'active', 'paused', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."pipeline_node_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."pipeline_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "executable_pipeline" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"origin_document_id" uuid,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "executable_pipeline_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_endpoint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"active_version_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"auth_policy" jsonb NOT NULL,
	"execution_policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_node_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"handler_type" text NOT NULL,
	"handler_version" text NOT NULL,
	"status" "pipeline_node_run_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"input_hash" text,
	"output_object_key" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"pipeline_version_id" uuid NOT NULL,
	"pipeline_version" integer NOT NULL,
	"source_application" text NOT NULL,
	"initiator_type" text DEFAULT 'service' NOT NULL,
	"initiator_id" text,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"input_payload" jsonb NOT NULL,
	"result_payload" jsonb,
	"input_object_key" text,
	"result_object_key" text,
	"status" "pipeline_run_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"retryable" boolean,
	"error_code" text,
	"error_message" text,
	"estimated_cost_usd" numeric(20, 8),
	"actual_cost_usd" numeric(20, 8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"retry_available_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"compiled_plan" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"published_by_user_id" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "executable_pipeline" ADD CONSTRAINT "executable_pipeline_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executable_pipeline" ADD CONSTRAINT "executable_pipeline_origin_document_id_document_id_fk" FOREIGN KEY ("origin_document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executable_pipeline" ADD CONSTRAINT "executable_pipeline_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_endpoint" ADD CONSTRAINT "pipeline_endpoint_pipeline_id_executable_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."executable_pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_endpoint" ADD CONSTRAINT "pipeline_endpoint_active_version_id_pipeline_version_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."pipeline_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_node_run" ADD CONSTRAINT "pipeline_node_run_pipeline_run_id_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_pipeline_id_executable_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."executable_pipeline"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_pipeline_version_id_pipeline_version_id_fk" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_version" ADD CONSTRAINT "pipeline_version_pipeline_id_executable_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."executable_pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_version" ADD CONSTRAINT "pipeline_version_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executable_pipeline_workspace_status_idx" ON "executable_pipeline" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "executable_pipeline_origin_document_idx" ON "executable_pipeline" USING btree ("origin_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_endpoint_pipeline_unique" ON "pipeline_endpoint" USING btree ("pipeline_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_endpoint_public_id_unique" ON "pipeline_endpoint" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_node_run_attempt_unique" ON "pipeline_node_run" USING btree ("pipeline_run_id","node_id","attempt_count");--> statement-breakpoint
CREATE INDEX "pipeline_node_run_run_status_idx" ON "pipeline_node_run" USING btree ("pipeline_run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_run_workspace_idempotency_unique" ON "pipeline_run" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "pipeline_run_claim_idx" ON "pipeline_run" USING btree ("status","retry_available_at","lease_expires_at","enqueued_at");--> statement-breakpoint
CREATE INDEX "pipeline_run_pipeline_created_idx" ON "pipeline_run" USING btree ("pipeline_id","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_run_workspace_created_idx" ON "pipeline_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_run_source_created_idx" ON "pipeline_run" USING btree ("source_application","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_version_pipeline_version_unique" ON "pipeline_version" USING btree ("pipeline_id","version");--> statement-breakpoint
CREATE INDEX "pipeline_version_pipeline_published_idx" ON "pipeline_version" USING btree ("pipeline_id","published_at");