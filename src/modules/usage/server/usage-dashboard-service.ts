import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import type { UsageDashboardData, UsagePeriod } from '../contracts/usage-dashboard';
import { readUsageDashboardRows } from './usage-dashboard-repository';
import { usageComparisonWindow } from '../core/usage-periods';

const defaults = { authorize: requireWorkspaceMembership, read: readUsageDashboardRows };
export function createUsageDashboardService(dependencies: {
  authorize: (userId: string, workspaceId: string) => Promise<unknown>;
  read: typeof readUsageDashboardRows;
  now?: () => Date;
} = defaults) {
  return async (userId: string, workspaceId: string, period: UsagePeriod): Promise<UsageDashboardData> => {
    await dependencies.authorize(userId, workspaceId);
    const now = dependencies.now?.() ?? new Date();
    const comparison = usageComparisonWindow(period, now);
    const [rows, previousRows] = await Promise.all([
      dependencies.read(workspaceId, { ...period, end: comparison.currentThrough }),
      dependencies.read(workspaceId, { ...comparison.period, end: comparison.previousThrough }),
    ]);
    return { workspaceId, generatedAt: now.toISOString(), period, rows, comparison: { ...comparison, rows: previousRows } };
  };
}
export const getUsageDashboard = createUsageDashboardService();
