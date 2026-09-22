import { sql } from 'drizzle-orm';
import { chatConversations, chatMessages } from '@prodactionpro/chat-persistence-drizzle/schema';
import { productionChat } from './production-chat-schema';

// An assistant activity, a document name or an empty conversation is not a started dialogue.
// Legacy conversations and direct video requests get an intent title from their first user message.
const firstIntent = sql<string | null>`(select intent.title from ${chatMessages} first_message cross join lateral (select coalesce(
  nullif(left(btrim(regexp_replace((select string_agg(block->>'content', ' ' order by position)
    from jsonb_array_elements(first_message.blocks) with ordinality as parts(block, position)
    where block->>'type' in ('text', 'markdown')), '\\s+', ' ', 'g')), 90), ''),
  case when (case when jsonb_typeof(first_message.metadata->'attachments') = 'array'
    then jsonb_array_length(first_message.metadata->'attachments') else 0 end) > 0
    or exists(select 1 from jsonb_array_elements(first_message.blocks) block where block->>'type' in ('image', 'file', 'video', 'audio'))
    then 'Обсуждение материалов' end) as title) intent
  where first_message.conversation_id = ${chatConversations.id}
    and first_message.role = 'user' and intent.title is not null
  order by first_message.created_at, first_message.id limit 1)`;

export const startedConversation = sql`${firstIntent} is not null`;
export const conversationDisplayTitle = sql<string>`coalesce(
  case when ${productionChat.titleSource} in ('intent', 'model', 'user') then nullif(btrim(${productionChat.title}), '') end,
  ${firstIntent})`;
