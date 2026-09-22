'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from '@prodactionpro/ui-core/icons';
import { WorkspaceProjectTree } from './workspace-project-tree';
import { useWorkspaceShell } from './workspace-shell-context';
import { NavigationIcon } from './navigation-icon';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { useSidebarCollectionExpanded } from '../model/use-sidebar-collection-expanded';

export function WorkspaceProjectsNavigation() {
  const { locale, text } = useInterfaceLocale();
  const workspace = useWorkspaceShell();
  const router = useRouter();
  const [parentId, setParentId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useSidebarCollectionExpanded('projects');
  const folders = workspace.folders.filter((folder) => folder.workspaceId === workspace.activeWorkspace?.id)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const create = (parent?: string) => { setExpanded(true); setParentId(parent); setEditingId(undefined); setCreating(true); setName(''); setError(''); };

  return <section className="production-projects" aria-label={text('Проекты', 'Projects')}>
    <div className="production-projects-heading">
      <button className="production-group-toggle" type="button" aria-expanded={expanded} aria-controls="sidebar-projects" onClick={() => setExpanded(!expanded)}><span>{text('Проекты', 'Projects')}</span>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
      <div className="production-group-actions"><ProTooltip label={text('Новый проект', 'New project')}><button type="button" className="production-small-button production-project-add" aria-label={text('Новый проект', 'New project')}
        disabled={!workspace.activeWorkspace} onClick={() => create()}><NavigationIcon name="plus" /></button></ProTooltip></div>
    </div>
    <div id="sidebar-projects" hidden={!expanded}>
    {creating ? <form className="production-project-form" onSubmit={async (event) => {
      event.preventDefault(); if (busy || !name.trim()) return;
      setBusy(true); setError('');
      try { const folder = await workspace.saveFolder(name.trim(), editingId, parentId); setCreating(false); if (!parentId && !editingId) router.push(`/folders/${folder.id}`); }
      catch { setError(text('Не удалось сохранить проект. Попробуйте ещё раз.', 'Could not save the project. Please try again.')); }
      finally { setBusy(false); }
    }}>
      <input autoFocus className="production-project-input" aria-label={text('Название проекта', 'Project name')} placeholder={text('Название проекта', 'Project name')}
        required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit" disabled={busy || !name.trim()}>{busy ? text('Сохраняем…', 'Saving…') : editingId ? text('Сохранить', 'Save') : text('Создать', 'Create')}</button>
      <button type="button" aria-label={text('Отменить создание проекта', 'Cancel project creation')} disabled={busy} onClick={() => setCreating(false)}><X size={14} /></button>
    </form> : null}
    {error ? <p role="alert" className="production-navigation-error">{error}</p> : null}
    <WorkspaceProjectTree key={workspace.activeWorkspace?.id} folders={folders} workspaceId={workspace.activeWorkspace?.id} onCreate={create}
      onRename={(folder) => { setEditingId(folder.id); setParentId(undefined); setName(folder.name); setCreating(true); setError(''); }} />
    </div>
  </section>;
}
