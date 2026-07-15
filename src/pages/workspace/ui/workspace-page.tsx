'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { AssistantFloatingButton } from '@/shared/ui/assistant-floating-button';
import { ContextMenu } from '@/shared/ui/context-menu';
import type { ContextMenuAction } from '@/shared/ui/context-menu-types';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { AssistantShell } from '@/widgets/assistant-shell/ui/assistant-shell';
import type { ProjectSummary, WorkspaceSection } from '@/entities/workspace/model/types';
import {
  Archive,
  Edit3,
  GalleryVerticalEnd,
  Grid2X2,
  Images,
  List,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Route,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useWorkspaceProjects } from '../model/use-workspace-projects';

const navItems: Array<{ id: WorkspaceSection; icon: typeof GalleryVerticalEnd; label: string }> = [
  { id: 'my-files', icon: GalleryVerticalEnd, label: 'My Files' },
  { id: 'library', icon: Images, label: 'Library' },
  { id: 'pipelines', icon: Route, label: 'Pipelines' },
  { id: 'trash', icon: Trash2, label: 'Trash' },
];

const templateCards = [
  { image: '/workspace-assets/template-01.png', title: 'Change face' },
  { image: '/workspace-assets/template-02.png', title: 'Change Clothes' },
  { image: '/workspace-assets/template-03.png', title: 'Change Face Node' },
  { image: '/workspace-assets/template-04.png', title: 'Change subscriber' },
  { image: '/workspace-assets/template-05.png', title: 'Change audio' },
  { image: '/workspace-assets/template-06.png', title: 'Change Models' },
  { image: '/workspace-assets/template-07.png', title: 'Change Machine' },
  { image: '/workspace-assets/template-08.png', title: 'Change face' },
];

const tutorialCards = [
  { image: '/workspace-assets/template-03.png', title: 'Build a content pipeline' },
  { image: '/workspace-assets/template-06.png', title: 'Connect AI models' },
  { image: '/workspace-assets/template-02.png', title: 'Prepare batch inputs' },
  { image: '/workspace-assets/template-07.png', title: 'Publish final assets' },
];

type TemplateTab = 'templates' | 'tutorials';

export function WorkspacePage() {
  const router = useRouter();
  const contextMenu = useContextMenu();
  const workspace = useWorkspaceProjects();
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('my-files');
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateTab>('templates');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const visibleTemplateCards = activeTemplateTab === 'templates' ? templateCards : tutorialCards;
  const sectionProjects = workspace.getProjectsForSection(activeSection);
  const visibleProjects = useMemo(() => sectionProjects.filter((project) => {
    const matchesFavorite = activeSection !== 'trash' && favoritesOnly ? project.favorite : true;
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    return matchesFavorite && matchesSearch;
  }), [activeSection, favoritesOnly, searchQuery, sectionProjects]);
  const sectionTitle = activeSection === 'trash' ? 'Trash' : 'My Files';

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeProfileMenu = (event: MouseEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };

    window.addEventListener('mousedown', closeProfileMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeProfileMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  const createProject = () => {
    const project = workspace.createProject();
    router.push(`/projects/${project.id}`);
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
        onSelect: () => workspace.deleteProject(project.id),
      },
    ];
  };

  const openProjectMenu = (project: ProjectSummary, event: ReactMouseEvent, minWidth = 210) => {
    contextMenu.openContextMenu(event, getProjectActions(project), minWidth);
  };

  return (
    <main className="workspace-page">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-sidebar-top">
          <div className="workspace-logo-row">
            <Link className="workspace-logo" href="/" aria-label="Reverie home">
              <img className="workspace-logo-default" src="/brand/reverie-logo-default.webp" alt="" />
              <img className="workspace-logo-hover" src="/brand/reverie-logo-hover.webp" alt="" />
            </Link>
            <button className="workspace-icon-button" type="button" aria-label="Collapse sidebar">
              <PanelLeftClose size={14} />
            </button>
          </div>
          <nav className="workspace-nav" aria-label="Studio">
            {navItems.map((item) => (
              <button
                className={`workspace-nav-item ${activeSection === item.id ? 'workspace-nav-item-active' : ''}`}
                key={item.label}
                onClick={() => setActiveSection(item.id)}
                type="button"
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="workspace-profile-area" ref={profileMenuRef}>
          <button
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            className="workspace-user"
            onClick={() => setProfileMenuOpen((open) => !open)}
            type="button"
          >
            <img src="/workspace-assets/avatar-john.png" alt="" />
            <span>John Malkovich</span>
          </button>
          {profileMenuOpen ? (
            <div className="workspace-profile-menu" role="menu">
              <div className="workspace-profile-menu-user">
                <img src="/workspace-assets/avatar-john.png" alt="" />
                <div>
                  <strong>John Malkovich</strong>
                  <span>john@reverie.local</span>
                </div>
              </div>
              <button type="button" role="menuitem">Account settings</button>
              <button type="button" role="menuitem">Workspace settings</button>
              <label className="workspace-menu-field">
                <span>Workspace</span>
                <select value={workspace.activeWorkspace?.id ?? 'workspace-john'} onChange={() => undefined}>
                  <option value={workspace.activeWorkspace?.id ?? 'workspace-john'}>{workspace.activeWorkspace?.name ?? "John's Workspace"}</option>
                  <option value="team">Creative Team</option>
                </select>
              </label>
              <div className="workspace-credit-panel">
                <span>AI generation credits</span>
                <strong>1,420</strong>
                <small>580 image credits and 840 text credits remaining</small>
              </div>
              <button className="workspace-upgrade-button" type="button">Upgrade</button>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="workspace-window" aria-label="Workspace projects">
        <header className="workspace-header">
          <h1>{workspace.activeWorkspace?.name ?? 'Workspace Name'}</h1>
        </header>

        <div className="workspace-content">
          <section className="workspace-template-band" aria-label="Templates">
            <div className="workspace-template-tabs">
              <button
                aria-selected={activeTemplateTab === 'templates'}
                className={`workspace-template-tab ${activeTemplateTab === 'templates' ? 'workspace-template-tab-active' : ''}`}
                onClick={() => setActiveTemplateTab('templates')}
                role="tab"
                type="button"
              >
                Templates
              </button>
              <button
                aria-selected={activeTemplateTab === 'tutorials'}
                className={`workspace-template-tab ${activeTemplateTab === 'tutorials' ? 'workspace-template-tab-active' : ''}`}
                onClick={() => setActiveTemplateTab('tutorials')}
                role="tab"
                type="button"
              >
                Tutorials
              </button>
            </div>
            <div className="workspace-template-list">
              {visibleTemplateCards.map((card) => (
                <button className="workspace-template-card" key={`${card.image}-${card.title}`} type="button">
                  <img src={card.image} alt="" />
                  <span>{card.title}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="workspace-files-section" aria-labelledby="workspace-files-title">
            <div className="workspace-files-header">
              <h2 id="workspace-files-title">{sectionTitle}</h2>
              <div className="workspace-files-actions">
                <button
                  aria-pressed={favoritesOnly}
                  className={`workspace-light-button ${favoritesOnly ? 'workspace-light-button-active' : ''}`}
                  disabled={activeSection === 'trash'}
                  onClick={() => setFavoritesOnly((active) => !active)}
                  type="button"
                  aria-label="Show favorites"
                >
                  <Star size={16} fill={favoritesOnly ? 'currentColor' : 'none'} />
                </button>
                <label className="workspace-search">
                  <Search size={16} />
                  <input aria-label="Search files" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search" type="search" value={searchQuery} />
                </label>
                <div className="workspace-view-toggle" aria-label="View mode">
                  <button className="workspace-light-button workspace-light-button-active" type="button" aria-label="Grid view">
                    <Grid2X2 size={16} />
                  </button>
                  <button className="workspace-light-button" type="button" aria-label="List view">
                    <List size={16} />
                  </button>
                </div>
                <button className="workspace-create-button" onClick={createProject} type="button">
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
                        <img src={project.thumbnailUrl} alt="" />
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

              {activeSection !== 'trash' ? (
                <button className="workspace-new-document" onClick={createProject} type="button">
                  <span className="workspace-new-document-icon">
                    <Plus size={24} />
                  </span>
                  <span>Create New</span>
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </section>
      <AssistantFloatingButton
        className={`assistant-floating-button-fixed ${assistantOpen ? 'assistant-floating-button-hidden' : ''}`}
        onClick={() => setAssistantOpen(true)}
      />
      <AssistantShell open={assistantOpen} contextLabel="Workspace" onClose={() => setAssistantOpen(false)} />
      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.closeContextMenu} />
    </main>
  );
}
