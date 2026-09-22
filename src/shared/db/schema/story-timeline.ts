import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { workspace } from './workspace';
import { user } from './auth';
import { studioFolder } from './studio-folder';
import { storyProject } from './story-project';

export const storyTimeline = pgTable('story_timeline', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  folderId: uuid('folder_id').references(() => studioFolder.id, { onDelete: 'set null' }),
  storyboardId: uuid('storyboard_id').references(() => storyProject.id, { onDelete: 'set null' }),
  name: text('name').notNull(), snapshot: jsonb('snapshot').$type<TimelineSnapshot>().notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('story_timeline_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
  index('story_timeline_storyboard_idx').on(table.storyboardId)]);
