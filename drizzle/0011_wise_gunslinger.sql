CREATE TABLE "pipeline_api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source_application" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pipeline_api_key" ADD CONSTRAINT "pipeline_api_key_endpoint_id_pipeline_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."pipeline_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_api_key" ADD CONSTRAINT "pipeline_api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_api_key_token_prefix_unique" ON "pipeline_api_key" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "pipeline_api_key_endpoint_active_idx" ON "pipeline_api_key" USING btree ("endpoint_id","revoked_at");