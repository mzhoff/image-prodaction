export interface MemberBudgetPolicy {
  enabled: boolean;
  limitUsd: string | null;
  period: 'lifetime' | 'month';
  mode: 'observed' | 'strict';
  revision: number;
}
export interface MemberBudgetRow extends MemberBudgetPolicy {
  userId: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | null;
  spentUsd: string;
  unresolved: number;
  requests: number;
  images: number;
  videos: number;
  assistant: number;
  totalTokens: string;
}
export interface MemberBudgetData {
  workspaceId: string;
  canManage: boolean;
  members: MemberBudgetRow[];
}
