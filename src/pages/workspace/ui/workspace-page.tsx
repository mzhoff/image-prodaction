'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import '@/shared/ui/filter-select.css';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Archive, Bookmark, Edit3, Folder, GraduationCap, Grid2X2, List, Plus, Route, Search, Star, Trash2, X } from '@prodactionpro/ui-core/icons';
import type { ProjectSummary, WorkspaceSection } from '@/entities/workspace/model/types';
import { ContextMenu } from '@/shared/ui/context-menu';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { useWorkspaceShell } from './workspace-shell-context';
import { ExecutablePipelinesSection } from './executable-pipelines-section';
import { WorkspaceTemplateBand, type TemplateTab } from './workspace-template-band';
import { StudioFoldersPage } from './studio-folders-page';
import { WorkspaceFileCard } from './workspace-file-card';
import { useWorkspacePipelines } from '../model/use-workspace-pipelines';
import { useWorkspaceSearchDialog } from './workspace-search-provider';
import { creationUrl } from '@/pages/create/model/create-draft';

interface WorkspacePageProps { section?: Exclude<WorkspaceSection, 'library'>; libraryOnly?: boolean; basePath?: string; navigation?: ReactNode; headerEnd?: ReactNode }

export function WorkspacePage({ section = 'my-files', libraryOnly = false, basePath = '/', navigation, headerEnd }: WorkspacePageProps) {
  const params = useSearchParams();
  const workspace = useWorkspaceShell();
  if (section === 'my-files' && !libraryOnly && params?.get('scope') === 'projects') return <StudioFoldersPage navigation={navigation} headerEnd={headerEnd} title="Flows" basePath={basePath} />;
  if (section === 'pipelines') return <ProductionSectionLayout title="Flows" navigation={navigation} headerEnd={headerEnd}>
    <ExecutablePipelinesSection workspaceId={workspace.activeWorkspace?.id} />
  </ProductionSectionLayout>;
  return <WorkspaceFiles section={section} libraryOnly={libraryOnly} basePath={basePath} navigation={navigation} headerEnd={headerEnd} />;
}

function WorkspaceFiles({ section = 'my-files', libraryOnly = false, basePath = '/', navigation, headerEnd }: WorkspacePageProps) {
  const tUi = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const contextMenu = useContextMenu();
  const workspace = useWorkspaceShell();
  const openSearch = useWorkspaceSearchDialog();
  const [learningOpen, setLearningOpen] = useState(false);
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateTab>('tutorials');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const folderId = params?.get('folderId') ?? '';
  const folder = workspace.folders.find((item) => item.id === folderId);
  const favoritesOnly = params?.get('favorites') === '1';
  const executableOnly = params?.get('executable') === '1';
  const query = params?.get('q') ?? '';
  const list = params?.get('view') === 'list';
  const showLearning = !libraryOnly && !folderId && section !== 'trash' && basePath === '/flows';
  const catalog = useWorkspacePipelines(executableOnly ? workspace.activeWorkspace?.id : undefined);
  const executableDocumentIds = new Set(catalog.pipelines.flatMap((pipeline) => (
    pipeline.originDocumentId ? [pipeline.originDocumentId] : []
  )));
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, '', `${libraryOnly ? '/library' : section === 'trash' ? '/trash' : basePath}?${next}`);
  };
  const resetFilters = () => {
    const next = new URLSearchParams(params?.toString());
    ['q', 'favorites', 'executable'].forEach((key) => next.delete(key));
    window.history.replaceState(null, '', `${libraryOnly ? '/library' : section === 'trash' ? '/trash' : basePath}?${next}`);
  };
  const visibleProjects = workspace.getProjectsForSection(section).filter((project) => (
    (!folderId || project.folderId === folderId)
    && (!libraryOnly || project.librarySaved)
    && (!favoritesOnly || project.favorite)
    && (!executableOnly || executableDocumentIds.has(project.id))
    && project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ));
  const title = libraryOnly ? 'Library' : section === 'trash' ? 'Trash' : basePath === '/flows' ? 'Flows' : 'Home';
  const filtered = Boolean(query || favoritesOnly || executableOnly);
  const commitRename = () => {
    if (editingProjectId) workspace.renameProject(editingProjectId, editingName);
    setEditingProjectId(null);
  };
  const actions = (project: ProjectSummary): ContextMenuAction[] => [
    { id: 'rename', icon: <Edit3 size={14} />, label: 'Rename', onSelect: () => { setEditingProjectId(project.id); setEditingName(project.name); } },
    { id: 'favorite', icon: <Star size={14} />, label: project.favorite ? 'Remove from favorites' : 'Add to favorites',
      disabled: project.status === 'trash', onSelect: () => workspace.toggleFavorite(project.id) },
    { id: 'library', icon: <Bookmark size={14} />, label: project.librarySaved ? tUi("Убрать из библиотеки") : tUi("Сохранить в библиотеку"),
      disabled: project.status === 'trash', onSelect: () => { void workspace.mutateProject(project.id, { librarySaved: !project.librarySaved }); } },
    { id: 'folder', kind: 'submenu', icon: <Folder size={14} />, label: tUi("Переместить в проект"), disabled: project.status === 'trash', actions: [
      ...workspace.folders.filter((item) => item.workspaceId === project.workspaceId).map((item) => ({ id: item.id, label: item.name,
        onSelect: () => { void workspace.mutateProject(project.id, { folderId: item.id }); } })),
    ] },
    project.status === 'trash'
      ? { id: 'restore', icon: <Archive size={14} />, label: 'Restore', separatorBefore: true, onSelect: () => workspace.restoreProject(project.id) }
      : { id: 'trash', icon: <Trash2 size={14} />, label: 'Move to trash', separatorBefore: true, onSelect: () => workspace.moveToTrash(project.id) },
    { id: 'delete', icon: <Trash2 size={14} />, label: 'Delete permanently', destructive: true, disabled: project.status !== 'trash', onSelect: () => { void workspace.deleteProject(project.id); } },
  ];
  const fileControls = <div className="workspace-files-header">
          <div className="workspace-files-primary-actions">
            {folder ? <h2><Link href="/flows?scope=projects">{tUi("Проекты /")}{' '} {folder.name}</Link></h2> : null}
            {!libraryOnly && !folderId && section !== 'trash' ? <>
              <button className={`workspace-filter-button production-filter-chip ${favoritesOnly ? 'workspace-filter-button-active' : ''}`} type="button" aria-pressed={favoritesOnly}
                onClick={() => setFilter('favorites', favoritesOnly ? '' : '1')}><Star size={15} fill={favoritesOnly ? 'currentColor' : 'none'} />Favorites</button>
              <Link className="workspace-filter-button" href="/flows?scope=projects"><Folder size={15} />Projects</Link>
              <button className={`workspace-filter-button production-filter-chip ${executableOnly ? 'workspace-filter-button-active' : ''}`} type="button" aria-pressed={executableOnly}
                onClick={() => setFilter('executable', executableOnly ? '' : '1')}><Route size={15} />Executable</button>
            </> : null}
          </div>
          <div className="workspace-files-actions">
            {folder ? <Link className="studio-button" href={`/library?folderId=${folder.id}`}><Folder size={16} />{tUi("Графика проекта")}</Link> : null}
            {query ? <button className="workspace-filter-button production-filter-chip" type="button" onClick={() => setFilter('q', '')} aria-label={tUi("Сбросить поиск")}>{query}<X size={14} /></button> : null}
            <ProTooltip label={tUi("Поиск по Flows")} side="bottom"><button className="workspace-light-button workspace-flow-search" type="button" aria-label={tUi("Поиск по Flows")} aria-haspopup="dialog" onClick={() => openSearch({ scope: 'flows', query })}><Search size={17} /></button></ProTooltip>
            <div className="workspace-view-toggle" aria-label="View mode">
              <button className={`workspace-light-button ${!list ? 'workspace-light-button-active' : ''}`} type="button" aria-label="Grid view" aria-pressed={!list} onClick={() => setFilter('view', '')}><Grid2X2 size={16} /></button>
              <button className={`workspace-light-button ${list ? 'workspace-light-button-active' : ''}`} type="button" aria-label="List view" aria-pressed={list} onClick={() => setFilter('view', 'list')}><List size={16} /></button>
            </div>
          </div>
        </div>;
  return <ProductionSectionLayout title={title} navigation={navigation} headerEnd={headerEnd}
    tools={showLearning ? <ProTooltip label={tUi("Туториалы и шаблоны")} side="bottom"><button className="section-tool-button workspace-learning-toggle" type="button" aria-label={tUi("Туториалы и шаблоны")} aria-expanded={learningOpen} aria-controls="flows-learning" onClick={() => setLearningOpen((open) => !open)}><GraduationCap size={19} /></button></ProTooltip> : null}
    actions={!libraryOnly && section !== 'trash' ? <>
      <button className="workspace-create-button" disabled={!workspace.activeWorkspace || Boolean(folderId && !folder)} type="button" onClick={() => router.push(creationUrl('flow', { folderId }))}><Plus size={18} />{tUi("Новый Flow")}</button>
    </> : undefined}
    controls={showLearning ? undefined : fileControls}>
      {workspace.error ? <p className="workspace-load-error" role="alert">{typeof (workspace.error) === 'string' ? tUi((workspace.error) as string) : (workspace.error)}</p> : null}
      {showLearning ? <><WorkspaceTemplateBand open={learningOpen} activeTab={activeTemplateTab} onTabChange={setActiveTemplateTab} /><div className="flows-file-controls">{fileControls}</div></> : null}
      <section className="workspace-files-section" aria-label={title}>
        {libraryOnly ? <p className="studio-hint">{tUi("Сохранённые канвасы для повторного использования. Добавьте через меню файла «Сохранить в библиотеку».")}{' '} <Link href="/pipelines">{tUi("Опубликованные API-пайплайны →")}</Link></p> : null}
        <div className={`workspace-project-grid ${list ? 'workspace-project-list' : ''}`}>
          {visibleProjects.map((project) => <WorkspaceFileCard key={project.id} project={project}
            folderName={workspace.folders.find((item) => item.id === project.folderId)?.name} editing={editingProjectId === project.id}
            name={editingName} onName={setEditingName} commit={commitRename} cancel={() => setEditingProjectId(null)}
            favorite={() => workspace.toggleFavorite(project.id)} menu={(event) => contextMenu.openContextMenu(event, actions(project), 230)} />)}
          {workspace.hydrated && !workspace.error && visibleProjects.length === 0 ? catalog.loading ? <p role="status">{tUi("Проверяем исполняемые пайплайны…")}</p>
            : catalog.error ? <p role="alert">{tUi("Не удалось проверить Flows. Обновите страницу.")}</p> : <ProductionEmptyState kind="flows"
              title={filtered ? tUi("Подходящих Flows пока нет") : section === 'trash' ? tUi("В корзине ничего нет") : libraryOnly ? tUi("Сохраните свой первый Flow") : undefined}
              description={filtered ? tUi("Уберите фильтры, чтобы увидеть остальные Flows.") : section === 'trash' ? tUi("Удалённые документы появятся здесь.") : libraryOnly ? tUi("Добавьте Flow через его меню «Сохранить в библиотеку».") : undefined}
              action={filtered ? { label: tUi("Сбросить фильтры"), onClick: resetFilters }
                : { label: libraryOnly || section === 'trash' ? tUi("Открыть Flows") : tUi("Создать Flow"), href: libraryOnly || section === 'trash' ? '/flows' : creationUrl('flow', { folderId }) }} /> : null}
        </div>
      </section>
    <ContextMenu menu={contextMenu.menu} onClose={contextMenu.closeContextMenu} />
  </ProductionSectionLayout>;
}
