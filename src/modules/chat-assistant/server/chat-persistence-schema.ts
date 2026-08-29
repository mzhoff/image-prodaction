// Drizzle Kit schema entrypoint. Runtime persistence stays owned by ChatModule.
export {
  chatAgentTurnEvents,
  chatAgentTurns,
  chatAttachments,
  chatConversationEvents,
  chatConversations,
  chatLlmCalls,
  chatMessageAttachments,
  chatMessages,
  chatSupportHandoffSessions,
  chatSupportMessageAttachments,
  chatSupportMessages,
  chatSupportProviderEvents,
  chatToolCalls,
} from '@prodactionpro/chat-persistence-drizzle/schema';
