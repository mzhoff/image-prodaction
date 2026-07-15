import type { ProjectExport } from '@/entities/production-graph/model/project-schema';

export type WorkspaceSection = 'my-files' | 'library' | 'pipelines' | 'trash';

export type ProjectStatus = 'active' | 'trash';

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: 'owner' | 'admin' | 'member';
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  members: WorkspaceMember[];
}

export interface ProjectSummary {
  id: string;
  workspaceId: string;
  name: string;
  thumbnailUrl: string;
  favorite: boolean;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  snapshot?: ProjectExport;
}

export interface WorkspaceState {
  version: 1;
  activeWorkspaceId: string;
  workspaces: WorkspaceRecord[];
  projects: ProjectSummary[];
}
