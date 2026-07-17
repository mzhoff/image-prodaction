ALTER TABLE "generation_job" ADD COLUMN "usage_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "generation_job_lease_idx" ON "generation_job" USING btree ("status","lease_expires_at");