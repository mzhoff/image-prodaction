export interface StudioFolder {
  id: string;
  workspaceId: string;
  name: string;
  systemKey: string | null;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}
