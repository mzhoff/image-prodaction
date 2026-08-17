// Drizzle Kit schema entrypoint. Runtime persistence stays owned by ChatModule.
export {
  chatAgentTurnEvents,
  chatAgentTurns,
  chatAttachments,
  chatConversations,
  chatLlmCalls,
  chatMessageAttachments,
  chatMessages,
  chatToolCalls,
} from '@prodactionpro/chat-persistence-drizzle/schema';
