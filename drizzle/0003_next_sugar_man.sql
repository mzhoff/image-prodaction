CREATE TYPE "public"."asset_media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."asset_origin" AS ENUM('uploaded', 'generated', 'saved', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."asset_variant_purpose" AS ENUM('thumbnail', 'preview', 'poster');--> statement-breakpoint
CREATE TYPE "public"."generation_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "asset_variant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"purpose" "asset_variant_purpose" NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid,
	"created_by_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "generation_job_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"input_tokens" numeric(20, 0),
	"output_tokens" numeric(20, 0),
	"total_tokens" numeric(20, 0),
	"provider_cost_usd" numeric(20, 8),
	"internal_credits_charged" numeric(20, 8),
	"internal_credits_balance_after" numeric(20, 8),
	"final_asset_id" uuid,
	"retryable" boolean,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "media_kind" "asset_media_kind" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "origin" "asset_origin" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "library_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "asset" SET "library_visible" = true WHERE "status" = 'ready';--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "operation" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "generation_job_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_variant" ADD CONSTRAINT "asset_variant_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_final_asset_id_asset_id_fk" FOREIGN KEY ("final_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_variant_asset_purpose_unique" ON "asset_variant" USING btree ("asset_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_variant_storage_key_unique" ON "asset_variant" USING btree ("bucket","storage_key");--> statement-breakpoint
CREATE INDEX "asset_variant_asset_idx" ON "asset_variant" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_job_workspace_idempotency_unique" ON "generation_job" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_job_workspace_status_created_idx" ON "generation_job" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "generation_job_creator_created_idx" ON "generation_job" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_job_document_idx" ON "generation_job" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "generation_job_final_asset_idx" ON "generation_job" USING btree ("final_asset_id");--> statement-breakpoint
CREATE INDEX "asset_library_workspace_created_idx" ON "asset" USING btree ("workspace_id","library_visible","status","created_at","id");--> statement-breakpoint
CREATE INDEX "asset_library_origin_idx" ON "asset" USING btree ("workspace_id","origin");--> statement-breakpoint
CREATE INDEX "asset_library_media_kind_idx" ON "asset" USING btree ("workspace_id","media_kind");--> statement-breakpoint
CREATE INDEX "asset_library_model_idx" ON "asset" USING btree ("workspace_id","model_id");--> statement-breakpoint
CREATE INDEX "asset_generation_job_idx" ON "asset" USING btree ("generation_job_id");
