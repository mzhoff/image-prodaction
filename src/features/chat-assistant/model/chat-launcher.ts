import {
  createChatLauncher,
  type ChatLauncher,
  type ChatLauncherRuntime,
} from '@prodactionpro/chat-runtime-core';

const BUSY_PHASES = new Set(['loading', 'submitting', 'streaming']);

export function createHostedChatLauncher({
  externalDraftConflict,
  openSurface,
  runtime,
}: {
  externalDraftConflict: boolean;
  openSurface: () => void | Promise<void>;
  runtime: ChatLauncherRuntime;
}): ChatLauncher {
  const launcher = createChatLauncher({ openSurface, runtime });
  if (!externalDraftConflict) return launcher;
  return {
    open: async (request) => {
      await openSurface();
      if (BUSY_PHASES.has(runtime.getSnapshot().phase)) {
        return {
          reason: 'busy',
          sourceId: request.sourceId,
          status: 'blocked',
        };
      }
      return {
        reason: 'draft-conflict',
        sourceId: request.sourceId,
        status: 'blocked',
      };
    },
  };
}
