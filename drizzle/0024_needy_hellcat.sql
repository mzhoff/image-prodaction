CREATE TABLE "runtime_client_credential" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_client_id" uuid NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"scopes" jsonb,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtime_grant_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_client_id" uuid NOT NULL,
	"grant_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_pipeline_grant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_client_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"capability_key" text NOT NULL,
	"pinned_version_id" uuid NOT NULL,
	"pinned_version" integer NOT NULL,
	"pipeline_checksum" text NOT NULL,
	"input_schema_checksum" text NOT NULL,
	"output_schema_checksum" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"update_policy" text DEFAULT 'PINNED' NOT NULL,
	"execution_policy" jsonb NOT NULL,
	"cost_policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_service_client" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_application" text NOT NULL,
	"external_workspace_ref" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"scopes" jsonb NOT NULL,
	"grant_management_policy" text DEFAULT 'EXPLICIT_SCOPE' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_cost_reservation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"generation_job_id" uuid NOT NULL,
	"attempt_count" integer NOT NULL,
	"reserved_cost_usd" numeric(20, 8),
	"actual_cost_usd" numeric(20, 8),
	"pricing_snapshot_id" text,
	"state" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "pipeline_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "pipeline_node_run_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "service_client_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "grant_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "capability_key" text;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "pipeline_run_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "pipeline_node_run_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "service_client_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "grant_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "capability_key" text;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "runtime_service_client_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "runtime_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "runtime_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "grant_revision" integer;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "runtime_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "runtime_client_credential" ADD CONSTRAINT "runtime_client_credential_service_client_id_runtime_service_client_id_fk" FOREIGN KEY ("service_client_id") REFERENCES "public"."runtime_service_client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_client_credential" ADD CONSTRAINT "runtime_client_credential_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_grant_audit" ADD CONSTRAINT "runtime_grant_audit_service_client_id_runtime_service_client_id_fk" FOREIGN KEY ("service_client_id") REFERENCES "public"."runtime_service_client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_grant_audit" ADD CONSTRAINT "runtime_grant_audit_grant_id_runtime_pipeline_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."runtime_pipeline_grant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_pipeline_grant" ADD CONSTRAINT "runtime_pipeline_grant_service_client_id_runtime_service_client_id_fk" FOREIGN KEY ("service_client_id") REFERENCES "public"."runtime_service_client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_pipeline_grant" ADD CONSTRAINT "runtime_pipeline_grant_pipeline_id_executable_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."executable_pipeline"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_pipeline_grant" ADD CONSTRAINT "runtime_pipeline_grant_pinned_version_id_pipeline_version_id_fk" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."pipeline_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_service_client" ADD CONSTRAINT "runtime_service_client_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_service_client" ADD CONSTRAINT "runtime_service_client_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_cost_reservation" ADD CONSTRAINT "runtime_cost_reservation_pipeline_run_id_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_cost_reservation" ADD CONSTRAINT "runtime_cost_reservation_generation_job_id_generation_job_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_client_credential_prefix_unique" ON "runtime_client_credential" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "runtime_client_credential_client_idx" ON "runtime_client_credential" USING btree ("service_client_id");--> statement-breakpoint
CREATE INDEX "runtime_grant_audit_client_created_idx" ON "runtime_grant_audit" USING btree ("service_client_id","created_at");--> statement-breakpoint
CREATE INDEX "runtime_pipeline_grant_client_idx" ON "runtime_pipeline_grant" USING btree ("service_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_service_client_workspace_application_ref_unique" ON "runtime_service_client" USING btree ("workspace_id","source_application","external_workspace_ref");--> statement-breakpoint
CREATE INDEX "runtime_service_client_workspace_idx" ON "runtime_service_client" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_cost_reservation_call_unique" ON "runtime_cost_reservation" USING btree ("generation_job_id","attempt_count");--> statement-breakpoint
CREATE INDEX "runtime_cost_reservation_run_idx" ON "runtime_cost_reservation" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "generation_job_pipeline_run_idx" ON "generation_job" USING btree ("workspace_id","pipeline_run_id");--> statement-breakpoint
CREATE INDEX "usage_event_pipeline_run_idx" ON "usage_event" USING btree ("workspace_id","pipeline_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_run_runtime_client_grant_idempotency_unique" ON "pipeline_run" USING btree ("runtime_service_client_id","runtime_grant_id","idempotency_key");--> statement-breakpoint
-- Explicit cross-layer references avoid circular TypeScript schema imports.
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_runtime_client_fk" FOREIGN KEY ("runtime_service_client_id") REFERENCES "runtime_service_client"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_runtime_credential_fk" FOREIGN KEY ("runtime_credential_id") REFERENCES "runtime_client_credential"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_runtime_grant_fk" FOREIGN KEY ("runtime_grant_id") REFERENCES "runtime_pipeline_grant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_runtime_run_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_runtime_node_fk" FOREIGN KEY ("pipeline_node_run_id") REFERENCES "pipeline_node_run"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_runtime_client_fk" FOREIGN KEY ("service_client_id") REFERENCES "runtime_service_client"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_runtime_grant_fk" FOREIGN KEY ("grant_id") REFERENCES "runtime_pipeline_grant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_runtime_run_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_run"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_runtime_node_fk" FOREIGN KEY ("pipeline_node_run_id") REFERENCES "pipeline_node_run"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_runtime_client_fk" FOREIGN KEY ("service_client_id") REFERENCES "runtime_service_client"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_runtime_grant_fk" FOREIGN KEY ("grant_id") REFERENCES "runtime_pipeline_grant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_runtime_snapshot_complete" CHECK (
  ("runtime_service_client_id" IS NULL AND "runtime_credential_id" IS NULL AND "runtime_grant_id" IS NULL AND "grant_revision" IS NULL AND "runtime_snapshot" IS NULL)
  OR ("runtime_service_client_id" IS NOT NULL AND "runtime_grant_id" IS NOT NULL AND "grant_revision" > 0 AND "runtime_snapshot" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "runtime_pipeline_grant" ADD CONSTRAINT "runtime_pipeline_grant_positive_revision" CHECK ("revision" > 0 AND "pinned_version" > 0);--> statement-breakpoint
ALTER TABLE "runtime_cost_reservation" ADD CONSTRAINT "runtime_cost_reservation_nonnegative" CHECK ("attempt_count" > 0 AND ("reserved_cost_usd" IS NULL OR "reserved_cost_usd" >= 0) AND ("actual_cost_usd" IS NULL OR "actual_cost_usd" >= 0));--> statement-breakpoint
-- Fail closed during cutover, including inserts from unchanged v1 binaries.
-- No implicit adoption of legacy ownership and no second physical run.
CREATE FUNCTION runtime_guard_protocol_idempotency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('runtime-cutover:' || NEW.workspace_id::text || ':' || NEW.pipeline_id::text || ':' || NEW.idempotency_key, 0));
  IF EXISTS (
    SELECT 1 FROM pipeline_run r WHERE r.workspace_id = NEW.workspace_id
      AND r.pipeline_id = NEW.pipeline_id AND r.idempotency_key = NEW.idempotency_key
      AND ((r.runtime_service_client_id IS NULL) <> (NEW.runtime_service_client_id IS NULL))
  ) THEN
    RAISE EXCEPTION 'The operation already belongs to another runtime protocol.'
      USING ERRCODE = '23514', CONSTRAINT = 'runtime_protocol_idempotency_collision';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER runtime_protocol_idempotency_guard BEFORE INSERT ON pipeline_run
FOR EACH ROW EXECUTE FUNCTION runtime_guard_protocol_idempotency();
