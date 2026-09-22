ALTER TABLE studio_folder ADD COLUMN parent_id uuid;
--> statement-breakpoint
ALTER TABLE studio_folder ADD CONSTRAINT studio_folder_parent_workspace_fk
  FOREIGN KEY (workspace_id, parent_id) REFERENCES studio_folder(workspace_id, id);
--> statement-breakpoint
ALTER TABLE studio_folder ADD CONSTRAINT studio_folder_not_own_parent CHECK (parent_id IS DISTINCT FROM id);
--> statement-breakpoint
CREATE INDEX studio_folder_parent_idx ON studio_folder(workspace_id, parent_id);
--> statement-breakpoint
CREATE TABLE home_text_settings (
  id uuid PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES home_chat_conversation(conversation_id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  settings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX home_text_settings_owner_idx ON home_text_settings(workspace_id, user_id, conversation_id);
