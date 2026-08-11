ALTER TABLE "document" ADD COLUMN "has_ever_had_content" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "document" SET "has_ever_had_content" = true;
