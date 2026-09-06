ALTER TYPE "public"."asset_media_kind" ADD VALUE 'audio';
--> statement-breakpoint
ALTER TABLE "pipeline_run" DROP CONSTRAINT "pipeline_run_runtime_snapshot_complete";
--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_runtime_snapshot_complete" CHECK (
  ("runtime_service_client_id" IS NULL AND "runtime_credential_id" IS NULL AND "runtime_grant_id" IS NULL AND "grant_revision" IS NULL AND "runtime_snapshot" IS NULL)
  OR ("runtime_service_client_id" IS NOT NULL AND "runtime_grant_id" IS NOT NULL AND "grant_revision" IS NOT NULL AND "grant_revision" > 0 AND "runtime_snapshot" IS NOT NULL)
);
