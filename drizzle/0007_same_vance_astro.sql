ALTER TABLE "generation_job" ADD COLUMN "provider_dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "provider_dispatched_attempt" integer;