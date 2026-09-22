import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { chatConversations } from '@prodactionpro/chat-persistence-drizzle/schema';
import type { ManagedChatAttachmentRef } from '@prodactionpro/chat-domain';
import { user } from '@/shared/db/schema/auth';
import { workspace } from '@/shared/db/schema/workspace';
import { generationJob } from '@/shared/db/schema/generation';
import type { HomeGenerationStoredInput } from '../contracts/home-generation';
import type { HomeImageSettings, HomeSubjectSnapshot } from '../contracts/home-image-settings';
import type { HomeTextSettings } from '../contracts/home-text-settings';

export const homeChatConversation = pgTable('home_chat_conversation', {
  conversationId: text('conversation_id').primaryKey().references(() => chatConversations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('home_chat_conversation_owner_idx').on(table.workspaceId, table.userId, table.createdAt)]);

export const homeChatGeneration = pgTable('home_chat_generation', {
  id: uuid('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => homeChatConversation.conversationId, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sourceTurnId: text('source_turn_id').notNull(),
  sourceMessageId: text('source_message_id').notNull(),
  toolCallId: text('tool_call_id').notNull(),
  input: jsonb('input').$type<HomeGenerationStoredInput>().notNull(),
  attachments: jsonb('attachments').$type<ManagedChatAttachmentRef[]>().notNull(),
  jobId: uuid('job_id').references(() => generationJob.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('home_chat_generation_turn_key').on(table.conversationId, table.sourceTurnId),
  index('home_chat_generation_job_idx').on(table.jobId),
]);
export type HomeGenerationRecord = typeof homeChatGeneration.$inferSelect;

export const homeTextSettings = pgTable('home_text_settings', {
  id: uuid('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => homeChatConversation.conversationId, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<HomeTextSettings>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('home_text_settings_owner_idx').on(table.workspaceId, table.userId, table.conversationId)]);

export const homeImageSettings = pgTable('home_image_settings', {
  id: uuid('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => homeChatConversation.conversationId, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<HomeImageSettings>().notNull(),
  subjects: jsonb('subjects').$type<HomeSubjectSnapshot[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('home_image_settings_owner_idx').on(table.workspaceId, table.userId, table.conversationId)]);
