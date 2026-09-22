import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { chatConversations } from '@prodactionpro/chat-persistence-drizzle/schema';
import { studioFolder } from '@/shared/db/schema/studio-folder';

/** Product organization only. Messages, attachments, turns and usage remain in ChatModule. */
export const productionChat = pgTable('production_chat', {
  conversationId: text('conversation_id').primaryKey().references(() => chatConversations.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => studioFolder.id, { onDelete: 'set null' }),
  title: text('title'),
  titleSource: text('title_source').$type<'pending' | 'intent' | 'model' | 'user'>().notNull().default('pending'),
  status: text('status').$type<'active' | 'archived' | 'deleted'>().notNull().default('active'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('production_chat_folder_idx').on(table.folderId)]);
