import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import { createId } from '@/shared/lib/id';
import type { ProjectSummary, WorkspaceMember, WorkspaceState } from './types';

export const WORKSPACE_STORAGE_KEY = 'reverie-workspace:v1';

const DEFAULT_WORKSPACE_ID = 'workspace-john';
const DEFAULT_PROJECT_THUMBNAIL = '/workspace-assets/project-blog-pipeline.png';

const now = '2026-06-26T00:00:00.000Z';

export const defaultWorkspaceState: WorkspaceState = {
  version: 1,
  activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  workspaces: [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: "John's Workspace",
      members: [
        {
          id: 'member-john',
          name: 'John Malkovich',
          email: 'john@reverie.local',
          avatarUrl: '/workspace-assets/avatar-john.png',
          role: 'owner',
        },
      ],
    },
  ],
  projects: [
    {
      id: 'blog-articles-pipeline',
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Blog Articles Pipeline',
      thumbnailUrl: DEFAULT_PROJECT_THUMBNAIL,
      favorite: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'campaign-concepts-pipeline',
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Campaign Concepts Pipeline',
      thumbnailUrl: '/workspace-assets/template-06.png',
      favorite: false,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ],
};

export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === 'undefined') return defaultWorkspaceState;

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return defaultWorkspaceState;
    return normalizeWorkspaceState(JSON.parse(raw));
  } catch {
    return defaultWorkspaceState;
  }
}

export function saveWorkspaceState(state: WorkspaceState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(normalizeWorkspaceState(state)));
}

export function updateWorkspaceProjectSnapshot(projectId: string, snapshot: ProjectExport) {
  const state = loadWorkspaceState();
  const nextProjects = state.projects.map((project) => (
    project.id === projectId
      ? { ...project, snapshot, updatedAt: new Date().toISOString() }
      : project
  ));
  saveWorkspaceState({ ...state, projects: nextProjects });
}

export function createWorkspaceProject(name = 'Untitled Pipeline'): ProjectSummary {
  return {
    id: createId('project'),
    workspaceId: defaultWorkspaceState.activeWorkspaceId,
    name,
    thumbnailUrl: DEFAULT_PROJECT_THUMBNAIL,
    favorite: false,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeWorkspaceState(value: unknown): WorkspaceState {
  if (!isRecord(value)) return defaultWorkspaceState;

  const workspaces = Array.isArray(value.workspaces) && value.workspaces.length > 0
    ? value.workspaces.filter(isRecord).map((workspace) => ({
      id: readString(workspace.id, DEFAULT_WORKSPACE_ID),
      name: readString(workspace.name, "John's Workspace"),
      members: Array.isArray(workspace.members) && workspace.members.length > 0
        ? workspace.members.filter(isRecord).map((member) => ({
          id: readString(member.id, 'member'),
          name: readString(member.name, 'Member'),
          email: readString(member.email, 'member@reverie.local'),
          avatarUrl: readString(member.avatarUrl, '/workspace-assets/avatar-john.png'),
          role: readWorkspaceRole(member.role),
        }))
        : defaultWorkspaceState.workspaces[0].members,
    }))
    : defaultWorkspaceState.workspaces;
  const activeWorkspaceId = readString(value.activeWorkspaceId, workspaces[0].id);
  const projects = Array.isArray(value.projects)
    ? value.projects.filter(isRecord).map((project) => normalizeProject(project, activeWorkspaceId))
    : defaultWorkspaceState.projects;

  return {
    version: 1,
    activeWorkspaceId,
    workspaces,
    projects,
  };
}

function normalizeProject(project: Record<string, unknown>, workspaceId: string): ProjectSummary {
  return {
    id: readString(project.id, createId('project')),
    workspaceId: readString(project.workspaceId, workspaceId),
    name: readString(project.name, 'Untitled Pipeline'),
    thumbnailUrl: readString(project.thumbnailUrl, DEFAULT_PROJECT_THUMBNAIL),
    favorite: Boolean(project.favorite),
    status: project.status === 'trash' ? 'trash' : 'active',
    createdAt: readString(project.createdAt, new Date().toISOString()),
    updatedAt: readString(project.updatedAt, new Date().toISOString()),
    snapshot: isProjectExport(project.snapshot) ? project.snapshot : undefined,
  };
}

function readWorkspaceRole(value: unknown): WorkspaceMember['role'] {
  if (value === 'admin' || value === 'member') return value;
  return 'owner';
}

function isProjectExport(value: unknown): value is ProjectExport {
  return isRecord(value)
    && value.kind === 'projectSnapshot'
    && typeof value.schemaVersion === 'number'
    && typeof value.exportedAt === 'string'
    && isRecord(value.project);
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
