CREATE TABLE "node_template_preset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"node_type" text NOT NULL,
	"payload_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_bytes" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_template_preset_payload_version_positive" CHECK ("node_template_preset"."payload_version" > 0),
	CONSTRAINT "node_template_preset_payload_bytes_bounded" CHECK ("node_template_preset"."payload_bytes" > 0 AND "node_template_preset"."payload_bytes" <= 98304)
);
--> statement-breakpoint
ALTER TABLE "node_template_preset" ADD CONSTRAINT "node_template_preset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_template_preset" ADD CONSTRAINT "node_template_preset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "node_template_preset_user_workspace_fingerprint_unique" ON "node_template_preset" USING btree ("user_id","workspace_id","fingerprint");--> statement-breakpoint
CREATE INDEX "node_template_preset_user_workspace_updated_idx" ON "node_template_preset" USING btree ("user_id","workspace_id","updated_at");