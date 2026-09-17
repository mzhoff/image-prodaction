'use client';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Archive, Bookmark, Edit3, Folder, Grid2X2, List, Plus, Route, Search, Star, Trash2 } from '@prodactionpro/ui-core/icons';
import type { ProjectSummary, WorkspaceSection } from '@/entities/workspace/model/types';
import { ContextMenu } from '@/shared/ui/context-menu';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { useWorkspaceShell } from './workspace-shell-context';
import { ExecutablePipelinesSection } from './executable-pipelines-section';
import { WorkspaceTemplateBand, type TemplateTab } from './workspace-template-band';
import { StudioFoldersPage } from './studio-folders-page';
import { WorkspaceFileCard } from './workspace-file-card';
import { useWorkspacePipelines } from '../model/use-workspace-pipelines';

interface WorkspacePageProps { section?: Exclude<WorkspaceSection, 'library'>; libraryOnly?: boolean }

export function WorkspacePage({ section = 'my-files', libraryOnly = false }: WorkspacePageProps) {
  const params = useSearchParams();
  const workspace = useWorkspaceShell();
  if (section === 'my-files' && !libraryOnly && params?.get('scope') === 'projects') return <StudioFoldersPage />;
  if (section === 'pipelines') return <>
    <header className="workspace-header"><h1>{workspace.activeWorkspace?.name ?? 'Workspace'}</h1></header>
    <ExecutablePipelinesSection workspaceId={workspace.activeWorkspace?.id} />
  </>;
  return <WorkspaceFiles section={section} libraryOnly={libraryOnly} />;
}

function WorkspaceFiles({ section = 'my-files', libraryOnly = false }: WorkspacePageProps) {
  const router = useRouter();
  const params = useSearchParams();
  const contextMenu = useContextMenu();
  const workspace = useWorkspaceShell();
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateTab>('templates');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const folderId = params?.get('folderId') ?? '';
  const folder = workspace.folders.find((item) => item.id === folderId);
  const favoritesOnly = params?.get('favorites') === '1';
  const executableOnly = params?.get('executable') === '1';
  const query = params?.get('q') ?? '';
  const list = params?.get('view') === 'list';
  const catalog = useWorkspacePipelines(executableOnly ? workspace.activeWorkspace?.id : undefined);
  const executableDocumentIds = new Set(catalog.pipelines.flatMap((pipeline) => (
    pipeline.originDocumentId ? [pipeline.originDocumentId] : []
  )));
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, '', `${libraryOnly ? '/library' : section === 'trash' ? '/trash' : '/'}?${next}`);
  };
  const visibleProjects = workspace.getProjectsForSection(section).filter((project) => (
    (!folderId || project.folderId === folderId)
    && (!libraryOnly || project.librarySaved)
    && (!favoritesOnly || project.favorite)
    && (!executableOnly || executableDocumentIds.has(project.id))
    && project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ));
  const title = libraryOnly ? 'Библиотека · Пайплайны' : folder?.name ?? (folderId ? 'Проект' : section === 'trash' ? 'Trash' : 'My Files');
  const createProject = async () => {
    if (creating) return; setCreating(true); setError('');
    try { const created = await workspace.createProject(folderId || null); router.push(`/projects/${created.id}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось создать канвас.'); }
    finally { setCreating(false); }
  };
  const commitRename = () => {
    if (editingProjectId) workspace.renameProject(editingProjectId, editingName);
    setEditingProjectId(null);
  };
  const actions = (project: ProjectSummary): ContextMenuAction[] => [
    { id: 'rename', icon: <Edit3 size={14} />, label: 'Rename', onSelect: () => { setEditingProjectId(project.id); setEditingName(project.name); } },
    { id: 'favorite', icon: <Star size={14} />, label: project.favorite ? 'Remove from favorites' : 'Add to favorites',
      disabled: project.status === 'trash', onSelect: () => workspace.toggleFavorite(project.id) },
    { id: 'library', icon: <Bookmark size={14} />, label: project.librarySaved ? 'Убрать из библиотеки' : 'Сохранить в библиотеку',
      disabled: project.status === 'trash', onSelect: () => { void workspace.mutateProject(project.id, { librarySaved: !project.librarySaved }); } },
    { id: 'folder', kind: 'submenu', icon: <Folder size={14} />, label: 'Переместить в проект', disabled: project.status === 'trash', actions: [
      ...workspace.folders.filter((item) => item.workspaceId === project.workspaceId).map((item) => ({ id: item.id, label: item.name,
        onSelect: () => { void workspace.mutateProject(project.id, { folderId: item.id }); } })),
    ] },
    project.status === 'trash'
      ? { id: 'restore', icon: <Archive size={14} />, label: 'Restore', separatorBefore: true, onSelect: () => workspace.restoreProject(project.id) }
      : { id: 'trash', icon: <Trash2 size={14} />, label: 'Move to trash', separatorBefore: true, onSelect: () => workspace.moveToTrash(project.id) },
    { id: 'delete', icon: <Trash2 size={14} />, label: 'Delete permanently', destructive: true, disabled: project.status !== 'trash', onSelect: () => { void workspace.deleteProject(project.id); } },
  ];
  return <>
    <header className="workspace-header"><h1>{title}</h1>
      {workspace.error || error ? <p className="workspace-load-error" role="alert">{error || workspace.error}</p> : null}</header>
    <div className="workspace-content">
      {!libraryOnly && !folderId && section !== 'trash' ? <WorkspaceTemplateBand activeTab={activeTemplateTab} onTabChange={setActiveTemplateTab} /> : null}
      <section className="workspace-files-section" aria-label={title}>
        <div className="workspace-files-header">
          <div className="workspace-files-primary-actions">
            {folder ? <h2><Link href="/?scope=projects">Проекты / {folder.name}</Link></h2> : null}
            {!libraryOnly && section !== 'trash' ? <button className="workspace-create-button" disabled={creating || !workspace.activeWorkspace || Boolean(folderId && !folder)} type="button" onClick={() => void createProject()}><Plus size={18} />Create New</button> : null}
            {!libraryOnly && !folderId && section !== 'trash' ? <>
              <button className={`workspace-filter-button ${favoritesOnly ? 'workspace-filter-button-active' : ''}`} type="button" aria-pressed={favoritesOnly}
                onClick={() => setFilter('favorites', favoritesOnly ? '' : '1')}><Star size={15} fill={favoritesOnly ? 'currentColor' : 'none'} />Favorites</button>
              <Link className="workspace-filter-button" href="/?scope=projects"><Folder size={15} />Projects</Link>
              <button className={`workspace-filter-button ${executableOnly ? 'workspace-filter-button-active' : ''}`} type="button" aria-pressed={executableOnly}
                onClick={() => setFilter('executable', executableOnly ? '' : '1')}><Route size={15} />Executable</button>
            </> : null}
          </div>
          <div className="workspace-files-actions">
            {folder ? <Link className="studio-button" href={`/library?folderId=${folder.id}`}><Folder size={16} />Графика проекта</Link> : null}
            <label className="workspace-search"><Search size={16} /><PuiInput type="search" aria-label="Search files" placeholder="Search" value={query} onChange={(event) => setFilter('q', event.target.value)} /></label>
            <div className="workspace-view-toggle" aria-label="View mode">
              <button className={`workspace-light-button ${!list ? 'workspace-light-button-active' : ''}`} type="button" aria-label="Grid view" aria-pressed={!list} onClick={() => setFilter('view', '')}><Grid2X2 size={16} /></button>
              <button className={`workspace-light-button ${list ? 'workspace-light-button-active' : ''}`} type="button" aria-label="List view" aria-pressed={list} onClick={() => setFilter('view', 'list')}><List size={16} /></button>
            </div>
          </div>
        </div>
        {libraryOnly ? <p className="studio-hint">Сохранённые канвасы для повторного использования. Добавьте через меню файла «Сохранить в библиотеку». <Link href="/pipelines">Опубликованные API-пайплайны →</Link></p> : null}
        <div className={`workspace-project-grid ${list ? 'workspace-project-list' : ''}`}>
          {visibleProjects.map((project) => <WorkspaceFileCard key={project.id} project={project}
            folderName={workspace.folders.find((item) => item.id === project.folderId)?.name} editing={editingProjectId === project.id}
            name={editingName} onName={setEditingName} commit={commitRename} cancel={() => setEditingProjectId(null)}
            favorite={() => workspace.toggleFavorite(project.id)} menu={(event) => contextMenu.openContextMenu(event, actions(project), 230)} />)}
          {workspace.hydrated && visibleProjects.length === 0 ? <div className="workspace-empty-projects">{catalog.loading ? 'Проверяем исполняемые пайплайны…' : 'Нет файлов по выбранным условиям.'}</div> : null}
        </div>
      </section>
    </div>
    <ContextMenu menu={contextMenu.menu} onClose={contextMenu.closeContextMenu} />
  </>;
}
