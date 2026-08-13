// Drizzle Kit schema entrypoint. Runtime persistence stays owned by ChatModule.
export {
  chatAgentTurns,
  chatConversations,
  chatLlmCalls,
  chatMessages,
  chatToolCalls,
} from '@prodactionpro/chat-persistence-drizzle/schema';
