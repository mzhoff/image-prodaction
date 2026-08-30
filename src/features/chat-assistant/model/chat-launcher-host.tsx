'use client';

import type { ChatLauncher, ChatLauncherRuntime } from '@prodactionpro/chat-runtime-core';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { createHostedChatLauncher } from './chat-launcher';

interface ChatLauncherHost {
  openSurface: () => void | Promise<void>;
  registerLauncher?: (launcher: ChatLauncher) => () => void;
}

const ChatLauncherHostContext = createContext<ChatLauncherHost | undefined>(undefined);

export function ChatLauncherHostProvider({
  children,
  openSurface,
  registerLauncher,
}: ChatLauncherHost & { children: ReactNode }) {
  const value = useMemo(
    () => ({ openSurface, registerLauncher }),
    [openSurface, registerLauncher],
  );
  return (
    <ChatLauncherHostContext.Provider value={value}>
      {children}
    </ChatLauncherHostContext.Provider>
  );
}

export function useRegisterHostedChatLauncher(
  runtime: ChatLauncherRuntime,
  externalDraftConflict = false,
  registrationKey?: unknown,
) {
  const host = useContext(ChatLauncherHostContext);
  const launcher = useMemo(() => (
    host ? createHostedChatLauncher({
      externalDraftConflict,
      openSurface: host.openSurface,
      runtime,
    }) : undefined
  ), [externalDraftConflict, host, runtime]);

  useEffect(() => {
    if (!host?.registerLauncher || !launcher) return undefined;
    return host.registerLauncher(launcher);
  }, [host, launcher, registrationKey]);
}
