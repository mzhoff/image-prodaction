'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWorkspaceProject,
  defaultWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
} from '@/entities/workspace/model/workspace-storage';
import type { ProjectSummary, WorkspaceSection, WorkspaceState } from '@/entities/workspace/model/types';

export function useWorkspaceProjects() {
  const [state, setState] = useState<WorkspaceState>(() => defaultWorkspaceState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadWorkspaceState());
    setHydrated(true);
  }, []);

  const persist = useCallback((updater: (current: WorkspaceState) => WorkspaceState) => {
    setState((current) => {
      const next = updater(current);
      saveWorkspaceState(next);
      return next;
    });
  }, []);

  const activeWorkspace = useMemo(() => (
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0]
  ), [state.activeWorkspaceId, state.workspaces]);

  const createProject = useCallback(() => {
    const project = createWorkspaceProject('Untitled Pipeline');
    persist((current) => ({ ...current, projects: [project, ...current.projects] }));
    return project;
  }, [persist]);

  const renameProject = useCallback((projectId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;
    persist((current) => updateProject(current, projectId, { name: nextName }));
  }, [persist]);

  const toggleFavorite = useCallback((projectId: string) => {
    persist((current) => {
      const project = current.projects.find((item) => item.id === projectId);
      return updateProject(current, projectId, { favorite: !project?.favorite });
    });
  }, [persist]);

  const moveToTrash = useCallback((projectId: string) => {
    persist((current) => updateProject(current, projectId, { status: 'trash', favorite: false }));
  }, [persist]);

  const restoreProject = useCallback((projectId: string) => {
    persist((current) => updateProject(current, projectId, { status: 'active' }));
  }, [persist]);

  const deleteProject = useCallback((projectId: string) => {
    persist((current) => ({ ...current, projects: current.projects.filter((project) => project.id !== projectId) }));
  }, [persist]);

  const getProjectsForSection = useCallback((section: WorkspaceSection) => {
    if (section === 'trash') return state.projects.filter((project) => project.status === 'trash');
    return state.projects.filter((project) => project.status === 'active');
  }, [state.projects]);

  return {
    activeWorkspace,
    createProject,
    deleteProject,
    getProjectsForSection,
    hydrated,
    moveToTrash,
    projects: state.projects,
    renameProject,
    restoreProject,
    toggleFavorite,
  };
}

function updateProject(state: WorkspaceState, projectId: string, patch: Partial<ProjectSummary>): WorkspaceState {
  return {
    ...state,
    projects: state.projects.map((project) => (
      project.id === projectId
        ? { ...project, ...patch, updatedAt: new Date().toISOString() }
        : project
    )),
  };
}
