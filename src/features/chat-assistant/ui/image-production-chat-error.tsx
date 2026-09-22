'use client';

import { ChatErrorPanel, type ChatErrorRenderContext } from '@prodactionpro/chat-ui';
import { presentChatError } from '../model/chat-error-presentation';

export function renderImageProductionChatError({ error, canRetry, retry }: ChatErrorRenderContext) {
  return <ChatErrorPanel error={presentChatError(error)} onRetry={canRetry ? retry : undefined} />;
}
