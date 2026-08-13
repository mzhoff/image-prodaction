import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { chatConversations } from '@prodactionpro/chat-persistence-drizzle/schema';
import { document } from '@/shared/db/schema/document';
import { user } from '@/shared/db/schema/auth';
import { workspace } from '@/shared/db/schema/workspace';

export const chatDocumentConversation = pgTable('chat_document_conversation', {
  id: uuid('id').primaryKey(),
  documentId: uuid('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex('chat_document_conversation_document_user_key').on(table.documentId, table.userId),
  index('chat_document_conversation_workspace_idx').on(table.workspaceId, table.updatedAt),
  index('chat_document_conversation_conversation_idx').on(table.conversationId),
]);
