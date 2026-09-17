CREATE TABLE "account_model_preference" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "modality" text NOT NULL,
  "favorites" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tab" text DEFAULT 'all' NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "modality"),
  CONSTRAINT "account_model_preference_modality" CHECK ("modality" IN ('text', 'image', 'video', 'audio')),
  CONSTRAINT "account_model_preference_tab" CHECK ("tab" IN ('all', 'popular', 'favorites')),
  CONSTRAINT "account_model_preference_favorites" CHECK (jsonb_typeof("favorites") = 'array' AND jsonb_array_length("favorites") <= 500)
);
