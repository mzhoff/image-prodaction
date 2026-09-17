CREATE TABLE "studio_folder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"source_document_id" uuid,
	"payload" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "library_saved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_folder" ADD CONSTRAINT "studio_folder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_folder" ADD CONSTRAINT "studio_folder_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_profile" ADD CONSTRAINT "subject_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_profile" ADD CONSTRAINT "subject_profile_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_profile" ADD CONSTRAINT "subject_profile_source_document_id_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_folder_workspace_updated_idx" ON "studio_folder" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_folder_workspace_id_unique" ON "studio_folder" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "subject_profile_workspace_updated_idx" ON "subject_profile" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_workspace_folder_fk" FOREIGN KEY ("workspace_id","folder_id") REFERENCES "public"."studio_folder"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_folder_idx" ON "document" USING btree ("folder_id");