'use client';

import { createContext, useContext, useEffect } from 'react';
import type { ChatAttachmentDropTarget } from '@prodactionpro/chat-runtime-react';

export const AssistantAttachmentTargetContext = createContext<((target?: ChatAttachmentDropTarget) => void) | undefined>(undefined);

export function useAssistantAttachmentTarget(target: ChatAttachmentDropTarget) {
  const register = useContext(AssistantAttachmentTargetContext);
  useEffect(() => {
    register?.(target);
    return () => register?.(undefined);
  }, [register, target]);
}
