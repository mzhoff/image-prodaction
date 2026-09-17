import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { ModelModality, ModelTab } from '@/shared/model-preferences/contracts';
import { user } from './auth';

export const accountModelPreference = pgTable('account_model_preference', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  modality: text('modality').$type<ModelModality>().notNull(),
  favorites: jsonb('favorites').$type<string[]>().default([]).notNull(),
  tab: text('tab').$type<ModelTab>().default('all').notNull(),
  revision: integer('revision').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.modality] }),
  check('account_model_preference_modality', sql`${table.modality} IN ('text', 'image', 'video', 'audio')`),
  check('account_model_preference_tab', sql`${table.tab} IN ('all', 'popular', 'favorites')`),
  check('account_model_preference_favorites', sql`jsonb_typeof(${table.favorites}) = 'array' AND jsonb_array_length(${table.favorites}) <= 500`),
]);
