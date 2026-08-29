CREATE TABLE "pipeline_consumer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"pinned_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_application" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"execution_policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_api_key" ADD COLUMN "consumer_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "consumer_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_version" ADD COLUMN "input_schema_checksum" text;--> statement-breakpoint
ALTER TABLE "pipeline_version" ADD COLUMN "output_schema_checksum" text;--> statement-breakpoint
ALTER TABLE "pipeline_consumer" ADD CONSTRAINT "pipeline_consumer_pipeline_id_executable_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."executable_pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_consumer" ADD CONSTRAINT "pipeline_consumer_pinned_version_id_pipeline_version_id_fk" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."pipeline_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "pipeline_consumer" (
	"id",
	"pipeline_id",
	"pinned_version_id",
	"name",
	"source_application",
	"enabled",
	"execution_policy"
)
SELECT
	gen_random_uuid(),
	"pipeline_endpoint"."pipeline_id",
	"pipeline_endpoint"."active_version_id",
	"pipeline_api_key"."source_application",
	"pipeline_api_key"."source_application",
	true,
	"pipeline_endpoint"."execution_policy"
FROM "pipeline_api_key"
INNER JOIN "pipeline_endpoint"
	ON "pipeline_endpoint"."id" = "pipeline_api_key"."endpoint_id"
GROUP BY
	"pipeline_endpoint"."pipeline_id",
	"pipeline_endpoint"."active_version_id",
	"pipeline_endpoint"."execution_policy",
	"pipeline_api_key"."source_application";--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_consumer_pipeline_source_unique" ON "pipeline_consumer" USING btree ("pipeline_id","source_application");--> statement-breakpoint
CREATE INDEX "pipeline_consumer_pipeline_enabled_idx" ON "pipeline_consumer" USING btree ("pipeline_id","enabled");--> statement-breakpoint
ALTER TABLE "pipeline_api_key" ADD CONSTRAINT "pipeline_api_key_consumer_id_pipeline_consumer_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."pipeline_consumer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_consumer_id_pipeline_consumer_id_fk" FOREIGN KEY ("consumer_id") REFERENCES "public"."pipeline_consumer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_api_key_id_pipeline_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."pipeline_api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "pipeline_api_key"
SET "consumer_id" = "pipeline_consumer"."id"
FROM "pipeline_endpoint", "pipeline_consumer"
WHERE "pipeline_endpoint"."id" = "pipeline_api_key"."endpoint_id"
	AND "pipeline_consumer"."pipeline_id" = "pipeline_endpoint"."pipeline_id"
	AND "pipeline_consumer"."source_application" = "pipeline_api_key"."source_application";--> statement-breakpoint
UPDATE "pipeline_run"
SET "consumer_id" = "pipeline_consumer"."id"
FROM "pipeline_consumer"
WHERE "pipeline_consumer"."pipeline_id" = "pipeline_run"."pipeline_id"
	AND "pipeline_consumer"."source_application" = "pipeline_run"."source_application";--> statement-breakpoint
CREATE INDEX "pipeline_api_key_consumer_active_idx" ON "pipeline_api_key" USING btree ("consumer_id","revoked_at");--> statement-breakpoint
CREATE INDEX "pipeline_run_consumer_created_idx" ON "pipeline_run" USING btree ("consumer_id","created_at");
