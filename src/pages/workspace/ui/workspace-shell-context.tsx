'use client';

import { createContext, useContext } from 'react';
import type { useWorkspaceProjects } from '../model/use-workspace-projects';

export type WorkspaceShellModel = ReturnType<typeof useWorkspaceProjects>;

export const WorkspaceShellContext = createContext<WorkspaceShellModel | null>(null);

export function useWorkspaceShell() {
  const context = useContext(WorkspaceShellContext);
  if (!context) throw new Error('Workspace content must be rendered inside WorkspaceShell.');
  return context;
}
