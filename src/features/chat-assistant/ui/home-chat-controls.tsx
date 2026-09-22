'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { Plus } from '@prodactionpro/ui-core/icons';
import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { HomeChatHeaderTarget } from './home-chat-header-target';

export function HomeChatControls({ onNew, screen, preparing = false }: { workspaceId: string; onNew: () => void; screen?: 'image' | 'video' | 'text'; preparing?: boolean }) {
  const tUi = useTranslations();
  const headerTarget = useContext(HomeChatHeaderTarget);
  const state = useChatRuntimeState();
  const working = preparing || ['loading', 'submitting', 'streaming'].includes(state.phase);
  const createConversation = () => {
    if (!screen || working) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('chat');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    onNew();
  };
  const newConversation = screen ? <button className="home-chat-new" type="button" disabled={working}
    onClick={() => void createConversation()}><Plus size={16} />{tUi("Новый разговор")}</button> : null;
  return <div className="home-chat-controls">
    {screen ? <span className="home-agent-label">Production · AI agent</span> : null}
    {headerTarget ? createPortal(newConversation, headerTarget) : newConversation}
  </div>;
}
