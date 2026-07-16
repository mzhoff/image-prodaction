'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWorkspaceProject,
  deleteWorkspaceProject,
  fetchWorkspaceState,
  updateWorkspaceProject,
} from '@/entities/workspace/api/workspace-api';
import type { ProjectSummary, WorkspaceRecord, WorkspaceSection } from '@/entities/workspace/model/types';

export function useWorkspaceProjects() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchWorkspaceState(signal);
      setWorkspaces(result.workspaces);
      setProjects(result.projects);
      setError(null);
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') return;
      setError(caughtError instanceof Error ? caughtError.message : 'Workspace could not be loaded.');
    } finally {
      if (!signal?.aborted) setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const activeWorkspace = workspaces[0];

  const createProject = useCallback(async () => {
    if (!activeWorkspace) throw new Error('Workspace is not ready yet.');
    const project = await createWorkspaceProject(activeWorkspace.id);
    setProjects((current) => [project, ...current]);
    return project;
  }, [activeWorkspace]);

  const mutateProject = useCallback(async (
    projectId: string,
    patch: Pick<Partial<ProjectSummary>, 'favorite' | 'name' | 'status'>,
  ) => {
    const before = projects;
    setProjects((current) => current.map((project) => (
      project.id === projectId ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project
    )));
    try {
      const updated = await updateWorkspaceProject(projectId, patch);
      setProjects((current) => current.map((project) => project.id === projectId ? updated : project));
      setError(null);
    } catch (caughtError) {
      setProjects(before);
      setError(caughtError instanceof Error ? caughtError.message : 'Project update failed.');
    }
  }, [projects]);

  const renameProject = useCallback((projectId: string, name: string) => {
    const nextName = name.trim();
    if (nextName) void mutateProject(projectId, { name: nextName });
  }, [mutateProject]);

  const toggleFavorite = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (project) void mutateProject(projectId, { favorite: !project.favorite });
  }, [mutateProject, projects]);

  const moveToTrash = useCallback((projectId: string) => {
    void mutateProject(projectId, { status: 'trash', favorite: false });
  }, [mutateProject]);

  const restoreProject = useCallback((projectId: string) => {
    void mutateProject(projectId, { status: 'active' });
  }, [mutateProject]);

  const deleteProject = useCallback(async (projectId: string) => {
    const before = projects;
    setProjects((current) => current.filter((project) => project.id !== projectId));
    try {
      await deleteWorkspaceProject(projectId);
      setError(null);
    } catch (caughtError) {
      setProjects(before);
      setError(caughtError instanceof Error ? caughtError.message : 'Project deletion failed.');
    }
  }, [projects]);

  const getProjectsForSection = useCallback((section: WorkspaceSection) => (
    projects.filter((project) => project.status === (section === 'trash' ? 'trash' : 'active'))
  ), [projects]);

  return useMemo(() => ({
    activeWorkspace,
    createProject,
    deleteProject,
    error,
    getProjectsForSection,
    hydrated,
    moveToTrash,
    projects,
    refresh,
    renameProject,
    restoreProject,
    toggleFavorite,
  }), [
    activeWorkspace,
    createProject,
    deleteProject,
    error,
    getProjectsForSection,
    hydrated,
    moveToTrash,
    projects,
    refresh,
    renameProject,
    restoreProject,
    toggleFavorite,
  ]);
}
