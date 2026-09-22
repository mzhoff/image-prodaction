'use client';

import { useEffect } from 'react';
import { useCreateChatRuntime } from '@prodactionpro/chat-runtime-react';

type RuntimeOptions = Parameters<typeof useCreateChatRuntime>[0];
type InitialState = NonNullable<RuntimeOptions['initialState']>;

/** Shared adapter over the released ChatModule, not a second chat lifecycle. */
export function useAssistantRuntime({ conversationId, model, mode, ...options }: Omit<RuntimeOptions, 'initialState' | 'welcomeMessage'> & {
  conversationId?: string; model: string; mode: InitialState['selectedMode'];
}) {
  const runtime = useCreateChatRuntime({ ...options, welcomeMessage: false,
    initialState: { conversationId, phase: conversationId ? 'loading' : 'idle', selectedMode: mode, selectedModel: model } });
  useEffect(() => {
    if (conversationId) void runtime.loadConversation(conversationId).catch(() => undefined);
  }, [conversationId, runtime]);
  return runtime;
}
