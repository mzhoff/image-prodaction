'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { FileText, Plus, Search } from '@prodactionpro/ui-core/icons';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { useWorkspaceShell } from './workspace-shell-context';
import { ProjectFolderCard } from './project-folder-card';
import { useWorkspaceStories } from '../model/use-workspace-stories';
import { useWorkspaceSearchDialog } from './workspace-search-provider';

export function StudioFoldersPage({ library = false, navigation, title, basePath = '/folders', headerEnd }: {
  library?: boolean; navigation?: ReactNode; title?: string; basePath?: string; headerEnd?: ReactNode;
}) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell();
  const router = useRouter();
  const stories = useWorkspaceStories(workspace.activeWorkspace?.id);
  const params = useSearchParams();
  const openSearch = useWorkspaceSearchDialog();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = params?.get('view') === 'list';
  const folders = workspace.folders.filter((folder) => folder.workspaceId === workspace.activeWorkspace?.id);
  const setList = (value: boolean) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set('view', 'list'); else next.delete('view');
    router.replace(`${library ? '/library' : basePath}?${next}`, { scroll: false });
  };
  return <ProductionSectionLayout title={title ?? (library ? 'Library' : tUi("Проекты"))} navigation={navigation} headerEnd={headerEnd}
    actions={<button className="workspace-create-button" type="button" disabled={!workspace.activeWorkspace}
      onClick={() => { setEditing('new'); setName(''); setError(''); }}><Plus size={16} />{tUi("Новый проект")}</button>}
    controls={<div className="workspace-files-header">
        <div className="workspace-files-primary-actions">
          <Link className="workspace-filter-button" href="/flows"><FileText size={15} />Flows</Link>
        </div>
        <div className="workspace-files-actions">
          <ProTooltip label={tUi("Поиск проектов")} side="bottom"><button className="workspace-light-button workspace-flow-search" type="button" aria-label={tUi("Поиск проектов")} aria-haspopup="dialog" onClick={() => openSearch({ scope: 'projects' })}><Search size={17} /></button></ProTooltip>
          <div className="workspace-view-toggle">
            <button className="studio-button" type="button" aria-pressed={!list} onClick={() => setList(false)}>{tUi("Карточки")}</button>
            <button className="studio-button" type="button" aria-pressed={list} onClick={() => setList(true)}>{tUi("Список")}</button>
          </div>
        </div>
      </div>}>
    <div className="studio-organize-content">
      <p className="studio-hint">{library ? tUi("Медиа из Flows и историй проекта собираются вместе автоматически.") : tUi("Проект объединяет Flows, истории, монтаж и связанные медиа.")}</p>
      {editing ? <form className="studio-inline-form" onSubmit={async (event) => {
        event.preventDefault(); if (busy) return; setBusy(true); setError('');
        try { await workspace.saveFolder(name.trim(), editing === 'new' ? undefined : editing); setEditing(null); }
        catch { setError(tUi("Не удалось сохранить проект. Попробуйте ещё раз.")); }
        finally { setBusy(false); }
      }}>
        <PuiInput autoFocus aria-label={tUi("Название проекта")} maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder={tUi("Например, Content Hub")} />
        <button className="studio-button" type="submit" disabled={busy || !name.trim()}>{tUi("Сохранить")}</button>
        <button className="studio-button" type="button" disabled={busy} onClick={() => setEditing(null)}>{tUi("Отмена")}</button>
      </form> : null}
      {error || workspace.error ? <p role="alert">{typeof (error || workspace.error) === 'string' ? tUi((error || workspace.error) as string) : (error || workspace.error)}</p> : null}
      <div className={`workspace-project-grid project-folders-grid ${list ? 'project-folders-list' : ''}`}>
        {folders.map((folder) => {
          const projects = workspace.projects.filter((item) => item.workspaceId === folder.workspaceId && item.folderId === folder.id && item.status === 'active');
          const storyCount = stories?.stories.filter((item) => item.folderId === folder.id).length ?? 0;
          const timelineCount = stories?.timelines.filter((item) => item.folderId === folder.id).length ?? 0;
          return <ProjectFolderCard key={folder.id} folder={folder} media={library}
            description={`${projects.length} Flows${stories && !stories.error ? ` · ${storyCount} Storyboard · ${timelineCount} Timeline` : ''}`}
            previews={projects.flatMap((project) => project.thumbnailAvailable && project.thumbnailUrl ? [project.thumbnailUrl] : [])} />;
        })}
      </div>
      {workspace.hydrated && workspace.activeWorkspace && !workspace.error && !editing && folders.length === 0 ? <ProductionEmptyState kind="projects"
        action={{ label: tUi("Создать проект"), onClick: () => { setEditing('new'); setName(''); setError(''); } }} /> : null}
    </div>
  </ProductionSectionLayout>;
}
