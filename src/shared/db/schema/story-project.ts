import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { StorySnapshot } from '@/modules/story-projects/contracts/story-project';
import { workspace } from './workspace';
import { user } from './auth';
import { studioFolder } from './studio-folder';

export const storyProject = pgTable('story_project', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  folderId: uuid('folder_id').references(() => studioFolder.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  snapshot: jsonb('snapshot').$type<StorySnapshot>().notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('story_project_workspace_updated_idx').on(table.workspaceId, table.updatedAt)]);
