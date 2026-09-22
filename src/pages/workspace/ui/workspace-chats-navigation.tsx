'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight, SlidersHorizontal } from '@prodactionpro/ui-core/icons';
import { FilterSelect } from '@/shared/ui/filter-select';
import { SidebarChatList } from './sidebar-chat-list';
import { useWorkspaceShell } from './workspace-shell-context';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { NavigationIcon } from './navigation-icon';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { useSidebarCollectionExpanded } from '../model/use-sidebar-collection-expanded';

export function WorkspaceChatsNavigation() {
  const { text } = useInterfaceLocale();
  const { activeWorkspace } = useWorkspaceShell();
  const [expanded, setExpanded] = useSidebarCollectionExpanded('chats');
  const [status, setStatus] = useState('active');
  return <section className="production-projects production-chats-navigation" aria-label={text('Чаты', 'Chats')}>
    <div className="production-projects-heading"><button className="production-group-toggle" type="button" aria-expanded={expanded} aria-controls="sidebar-chats" onClick={() => setExpanded(!expanded)}><span>{text('Чаты', 'Chats')}</span>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
      <div className="production-group-actions"><ProTooltip label={text('Фильтр чатов', 'Chat filter')}><FilterSelect className="production-navigation-filter" label={text('Фильтр чатов', 'Chat filter')} nativeTooltip={false} icon={<SlidersHorizontal size={16} />} value={status} defaultValue="active"
        options={[{ value: 'active', label: text('Недавние', 'Recent') }, { value: 'archived', label: text('В архиве', 'Archived') }, { value: 'deleted', label: text('В корзине', 'Trash') }]}
        onChange={(value) => { setStatus(value); setExpanded(true); }} /></ProTooltip>
      <ProTooltip label={text('Новый чат', 'New chat')}><Link className="production-small-button" href="/" aria-label={text('Новый чат', 'New chat')}><NavigationIcon name="plus" /></Link></ProTooltip></div></div>
    <div id="sidebar-chats" hidden={!expanded}>{expanded ? <SidebarChatList key={`${activeWorkspace?.id}:${status}`} workspaceId={activeWorkspace?.id} status={status} /> : null}</div>
  </section>;
}
