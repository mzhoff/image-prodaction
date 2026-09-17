'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWorkspaceProject,
  deleteWorkspaceProject,
  fetchWorkspaceState,
  updateWorkspaceProject,
} from '@/entities/workspace/api/workspace-api';
import { discardEmptyDocumentProject } from '@/entities/document/api/document-api';
import { DOCUMENT_PREVIEW_UPDATED } from '@/entities/document/api/document-exit-tasks';
import { fetchStudioFolders, saveStudioFolder } from '@/entities/workspace/api/studio-folder-api';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import {
  clearPendingUntouchedDocument,
  listPendingUntouchedDocuments,
} from '@/entities/document/api/document-abandonment';
import type { ProjectSummary, WorkspaceRecord, WorkspaceSection } from '@/entities/workspace/model/types';

export function useWorkspaceProjects() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [folders, setFolders] = useState<StudioFolder[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchWorkspaceState(signal);
      const folderLists = await Promise.all(result.workspaces.map((item) => fetchStudioFolders(item.id, signal)));
      if (signal?.aborted) return;
      // Publish one complete navigation snapshot. An early file menu must not
      // capture an empty folder list while the sidebar is still loading it.
      setWorkspaces(result.workspaces);
      setProjects(result.projects);
      setFolders(folderLists.flat());
      setActiveWorkspaceId((current) => {
        if (result.workspaces.some((workspace) => workspace.id === current)) return current;
        const stored = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) ?? '';
        return result.workspaces.some((workspace) => workspace.id === stored)
          ? stored
          : result.workspaces[0]?.id ?? '';
      });
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
    const initialize = async () => {
      const pendingDocuments = listPendingUntouchedDocuments();
      await Promise.all(pendingDocuments.map(async (documentId) => {
        try {
          await discardEmptyDocumentProject(documentId);
          clearPendingUntouchedDocument(documentId);
        } catch {
          // Retry on the next Workspace visit; the server decides whether the document is still disposable.
        }
      }));
      await refresh(controller.signal);
    };
    void initialize();
    return () => controller.abort();
  }, [refresh]);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
    ?? workspaces[0];

  const selectWorkspace = useCallback((workspaceId: string) => {
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return;
    setActiveWorkspaceId(workspaceId);
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  }, [workspaces]);

  useEffect(() => {
    const controller = new AbortController();
    const update = () => { void refresh(controller.signal); };
    window.addEventListener(DOCUMENT_PREVIEW_UPDATED, update);
    return () => { controller.abort(); window.removeEventListener(DOCUMENT_PREVIEW_UPDATED, update); };
  }, [refresh]);

  const createProject = useCallback(async (folderId?: string | null) => {
    if (!activeWorkspace) throw new Error('Workspace is not ready yet.');
    const project = await createWorkspaceProject(activeWorkspace.id, undefined, folderId);
    setProjects((current) => [project, ...current]);
    return project;
  }, [activeWorkspace]);

  const mutateProject = useCallback(async (
    projectId: string,
    patch: Pick<Partial<ProjectSummary>, 'favorite' | 'name' | 'status' | 'folderId' | 'librarySaved'>,
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
    projects.filter((project) => project.workspaceId === activeWorkspace?.id
      && project.status === (section === 'trash' ? 'trash' : 'active'))
  ), [activeWorkspace?.id, projects]);

  const saveFolder = useCallback(async (name: string, id?: string) => {
    if (!activeWorkspace) throw new Error('Workspace is not ready yet.');
    const folder = await saveStudioFolder(activeWorkspace.id, name, id);
    setFolders((current) => [folder, ...current.filter((item) => item.id !== folder.id)]);
    return folder;
  }, [activeWorkspace]);

  return useMemo(() => ({
    activeWorkspace,
    workspaces,
    selectWorkspace,
    folders,
    saveFolder,
    mutateProject,
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
    workspaces,
    selectWorkspace,
    folders,
    saveFolder,
    mutateProject,
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

const ACTIVE_WORKSPACE_STORAGE_KEY = 'reverie-active-workspace:v1';
