ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "identity_subject" text;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_identity_subject_unique" UNIQUE("identity_subject");
