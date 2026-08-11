'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Archive,
  Edit3,
  FilePlus2,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import type { ProjectSummary, WorkspaceSection } from '@/entities/workspace/model/types';
import { ContextMenu } from '@/shared/ui/context-menu';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { useWorkspaceShell } from './workspace-shell-context';
import { ExecutablePipelinesSection } from './executable-pipelines-section';
import { WorkspaceTemplateBand, type TemplateTab } from './workspace-template-band';

interface WorkspacePageProps {
  section?: Exclude<WorkspaceSection, 'library'>;
}

export function WorkspacePage({ section = 'my-files' }: WorkspacePageProps) {
  const router = useRouter();
  const contextMenu = useContextMenu();
  const workspace = useWorkspaceShell();
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateTab>('templates');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const sectionProjects = workspace.getProjectsForSection(section);
  const visibleProjects = useMemo(() => sectionProjects.filter((project) => {
    const matchesFavorite = section !== 'trash' && favoritesOnly ? project.favorite : true;
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesFavorite && matchesSearch;
  }), [favoritesOnly, searchQuery, section, sectionProjects]);
  const sectionTitle = section === 'trash' ? 'Trash' : section === 'pipelines' ? 'Pipelines' : 'My Files';

  if (section === 'pipelines') {
    return (
      <>
        <header className="workspace-header">
          <h1>{workspace.activeWorkspace?.name ?? 'Workspace Name'}</h1>
          {workspace.error ? <p className="workspace-load-error" role="alert">{workspace.error}</p> : null}
        </header>
        <ExecutablePipelinesSection workspaceId={workspace.activeWorkspace?.id} />
      </>
    );
  }

  const createProject = async () => {
    if (creatingProject) return;
    setCreatingProject(true);
    try {
      const project = await workspace.createProject();
      router.push(`/projects/${project.id}`);
    } finally {
      setCreatingProject(false);
    }
  };

  const startRename = (project: ProjectSummary) => {
    setEditingProjectId(project.id);
    setEditingName(project.name);
  };

  const commitRename = () => {
    if (!editingProjectId) return;
    workspace.renameProject(editingProjectId, editingName);
    setEditingProjectId(null);
    setEditingName('');
  };

  const cancelRename = () => {
    setEditingProjectId(null);
    setEditingName('');
  };

  const getProjectActions = (project: ProjectSummary): ContextMenuAction[] => {
    const isTrash = project.status === 'trash';
    return [
      {
        id: 'rename',
        icon: <Edit3 size={14} />,
        label: 'Rename',
        onSelect: () => startRename(project),
      },
      {
        id: 'favorite',
        icon: <Star size={14} fill={project.favorite ? 'currentColor' : 'none'} />,
        label: project.favorite ? 'Remove from favorites' : 'Add to favorites',
        disabled: isTrash,
        onSelect: () => workspace.toggleFavorite(project.id),
      },
      isTrash
        ? {
          id: 'restore',
          icon: <Archive size={14} />,
          label: 'Restore',
          separatorBefore: true,
          onSelect: () => workspace.restoreProject(project.id),
        }
        : {
          id: 'trash',
          icon: <Trash2 size={14} />,
          label: 'Move to trash',
          separatorBefore: true,
          onSelect: () => workspace.moveToTrash(project.id),
        },
      {
        id: 'delete',
        icon: <Trash2 size={14} />,
        label: 'Delete permanently',
        destructive: true,
        onSelect: () => void workspace.deleteProject(project.id),
      },
    ];
  };

  const openProjectMenu = (project: ProjectSummary, event: ReactMouseEvent, minWidth = 210) => {
    contextMenu.openContextMenu(event, getProjectActions(project), minWidth);
  };

  return (
    <>
      <header className="workspace-header">
        <h1>{workspace.activeWorkspace?.name ?? 'Workspace Name'}</h1>
        {workspace.error ? <p className="workspace-load-error" role="alert">{workspace.error}</p> : null}
      </header>

      <div className="workspace-content">
        <WorkspaceTemplateBand activeTab={activeTemplateTab} onTabChange={setActiveTemplateTab} />

        <section className="workspace-files-section" aria-labelledby="workspace-files-title">
          <div className="workspace-files-header">
            <h2 id="workspace-files-title">{sectionTitle}</h2>
            <div className="workspace-files-actions">
              <button
                aria-pressed={favoritesOnly}
                className={`workspace-light-button ${favoritesOnly ? 'workspace-light-button-active' : ''}`}
                disabled={section === 'trash'}
                onClick={() => setFavoritesOnly((active) => !active)}
                type="button"
                aria-label="Show favorites"
              >
                <Star size={16} fill={favoritesOnly ? 'currentColor' : 'none'} />
              </button>
              <label className="workspace-search">
                <Search size={16} />
                <input
                  aria-label="Search files"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search"
                  type="search"
                  value={searchQuery}
                />
              </label>
              <div className="workspace-view-toggle" aria-label="View mode">
                <button className="workspace-light-button workspace-light-button-active" type="button" aria-label="Grid view">
                  <Grid2X2 size={16} />
                </button>
                <button className="workspace-light-button" type="button" aria-label="List view">
                  <List size={16} />
                </button>
              </div>
              <button
                className="workspace-create-button"
                disabled={creatingProject || !workspace.activeWorkspace}
                onClick={() => void createProject()}
                type="button"
              >
                <Plus size={18} />
                <span>Create New</span>
              </button>
            </div>
          </div>

          <div className="workspace-project-grid">
            {visibleProjects.map((project) => {
              const isFavorite = project.favorite;
              return (
                <article
                  className="workspace-project-card"
                  key={project.id}
                  onContextMenu={(event) => openProjectMenu(project, event)}
                >
                  <div className="workspace-project-preview">
                    <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
                      {project.thumbnailAvailable && project.thumbnailUrl ? (
                        <img src={project.thumbnailUrl} alt="" />
                      ) : (
                        <span className="workspace-project-preview-empty" aria-hidden="true">
                          <FilePlus2 size={22} />
                          <span>Preview will appear after editing</span>
                        </span>
                      )}
                    </Link>
                    {project.status === 'active' ? (
                      <button
                        aria-pressed={isFavorite}
                        className={`workspace-project-star ${isFavorite ? 'workspace-project-star-active' : ''}`}
                        onClick={() => workspace.toggleFavorite(project.id)}
                        type="button"
                        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                      </button>
                    ) : null}
                  </div>
                  <div className="workspace-project-title-row">
                    {editingProjectId === project.id ? (
                      <input
                        autoFocus
                        className="workspace-project-title-input"
                        value={editingName}
                        onBlur={commitRename}
                        onChange={(event) => setEditingName(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename();
                          if (event.key === 'Escape') cancelRename();
                        }}
                      />
                    ) : (
                      <h3>{project.name}</h3>
                    )}
                    <button
                      className="workspace-project-menu-button"
                      type="button"
                      aria-label="More actions"
                      onClick={(event) => openProjectMenu(project, event)}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </article>
              );
            })}
            {visibleProjects.length === 0 ? (
              <div className="workspace-empty-projects">No projects match this filter.</div>
            ) : null}

            {section !== 'trash' ? (
              <button
                className="workspace-new-document"
                disabled={creatingProject || !workspace.activeWorkspace}
                onClick={() => void createProject()}
                type="button"
              >
                <span className="workspace-new-document-icon">
                  <Plus size={24} />
                </span>
                <span>Create New</span>
              </button>
            ) : null}
          </div>
        </section>
      </div>
      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.closeContextMenu} />
    </>
  );
}
