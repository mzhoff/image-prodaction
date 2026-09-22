'use client';

import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { HomeSubmitAuthorizationController, isSubmitAuthorizedHomeTool } from './home-submit-authorization';
import { trackBehavior } from '@/shared/analytics/client';
import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';

export function useHomeSubmitAuthorization(enabled: boolean) {
  const runtime = useChatRuntime();
  const accessGate = useAiAccessGate();
  const state = useChatRuntimeState();
  const controller = useMemo(() => new HomeSubmitAuthorizationController(runtime, () => {
    trackBehavior('ip_generation_requested', { source: 'home', operation: 'generate_image' });
  }), [runtime]);
  const authorization = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const pending = state.pendingToolCalls.some((tool) => tool.status === 'needs-confirmation' && isSubmitAuthorizedHomeTool(tool));
    if (pending && ['idle', 'error'].includes(state.phase)) {
      void accessGate.ensure().then((allowed) => { if (current && allowed) return controller.runPending(); });
    } else void controller.runPending();
    return () => { current = false; };
  }, [controller, enabled, state.conversationId, state.phase, state.pendingToolCalls, accessGate]);
  return { pendingToolId: authorization.pendingToolId, error: authorization.error,
    retry: authorization.retryToolId ? async () => { if (await accessGate.ensure()) await controller.retry(); } : undefined,
    cancelPending: () => controller.cancelPending() };
}
