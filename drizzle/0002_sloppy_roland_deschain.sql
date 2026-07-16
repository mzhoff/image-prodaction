ALTER TABLE "user" ADD COLUMN "terms_accepted_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "terms_version" text NOT NULL;