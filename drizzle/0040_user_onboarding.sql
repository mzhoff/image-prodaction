CREATE TABLE "user_onboarding" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "step" text NOT NULL DEFAULT 'about' CHECK ("step" IN ('about','work','goals','tasks','experience')),
  "answers" jsonb NOT NULL DEFAULT '{}',
  "locale" text NOT NULL DEFAULT 'ru' CHECK ("locale" IN ('ru','en')),
  "theme" text NOT NULL DEFAULT 'system' CHECK ("theme" IN ('light','dark','system')),
  "revision" integer NOT NULL DEFAULT 0,
  "return_to" text NOT NULL DEFAULT '/',
  "legacy_exempt" boolean NOT NULL DEFAULT false,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
--> statement-breakpoint
-- Existing accounts keep access. New accounts must complete their own questionnaire.
INSERT INTO "user_onboarding" ("user_id", "legacy_exempt") SELECT "id", true FROM "user";
