ALTER TABLE "executable_pipeline" ADD COLUMN "origin_section_id" text;--> statement-breakpoint
ALTER TABLE "pipeline_version" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "executable_pipeline_origin_section_unique" ON "executable_pipeline" USING btree ("origin_document_id","origin_section_id");