CREATE TYPE "public"."document_thumbnail_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "thumbnail_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "thumbnail_mode" "document_thumbnail_mode" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "thumbnail_updated_at" timestamp with time zone;