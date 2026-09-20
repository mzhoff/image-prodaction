CREATE TABLE "workspace_ai_member_policy" (
 "workspace_id" uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
 "user_id" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "enabled" boolean NOT NULL DEFAULT true,
 "limit_usd" numeric(20,8) CHECK(limit_usd >= 0),
 "period" text NOT NULL DEFAULT 'lifetime' CHECK(period IN ('lifetime','month')),
 "mode" text NOT NULL DEFAULT 'observed' CHECK(mode IN ('observed','strict')),
 "revision" integer NOT NULL DEFAULT 0,
 "updated_by" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "updated_at" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
--> statement-breakpoint
CREATE TABLE "workspace_ai_chat_call" (
 "id" uuid PRIMARY KEY,
 "workspace_id" uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
 "user_id" text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 "model" text NOT NULL, "status" text NOT NULL DEFAULT 'pending',
 "cost_usd" numeric(20,8) CHECK(cost_usd >= 0),
 "input_tokens" numeric(20,0), "output_tokens" numeric(20,0), "total_tokens" numeric(20,0),
 "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX workspace_ai_chat_member_idx ON workspace_ai_chat_call(workspace_id,user_id,created_at);
