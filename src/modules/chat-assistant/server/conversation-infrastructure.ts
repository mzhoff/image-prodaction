import { PersistentConversationEventBus } from '@prodactionpro/chat-application';
import { DrizzleConversationEventStore, DrizzleConversationStore, PostgresConversationEventWakeup } from '@prodactionpro/chat-persistence-drizzle';
import { getDb, getPostgresPool } from '@/shared/db/client';

let infrastructure: ReturnType<typeof createInfrastructure> | undefined;

/** Factual messages use persistence and replay without requiring an LLM connection. */
export function getChatConversationInfrastructure() {
  infrastructure ??= createInfrastructure();
  return infrastructure;
}

function createInfrastructure() {
  const store = new DrizzleConversationStore(getDb());
  const wakeup = new PostgresConversationEventWakeup(getPostgresPool(), {
    onError: (error) => console.error('[chat-assistant-event-wakeup-error]', error),
  });
  const eventBus = new PersistentConversationEventBus(new DrizzleConversationEventStore(getDb()), {
    onError: (error) => console.error('[chat-assistant-event-replay-error]', error),
    wakeup,
  });
  return { store, eventBus };
}
