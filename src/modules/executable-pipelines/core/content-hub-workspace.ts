export const CONTENT_HUB_PROJECT_SYSTEM_KEY = 'content-hub';
export const CONTENT_HUB_PROJECT_NAME = 'Content Hub';

export function isCanonicalContentHubWorkspace(workspaceId: string, client: { sourceApplication: string; externalWorkspaceRef: string }) {
  return client.sourceApplication !== 'content-hub' || client.externalWorkspaceRef === workspaceId;
}
