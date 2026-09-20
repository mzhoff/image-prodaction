import { sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
export type BudgetTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
/** Latest observation per physical generation attempt; the initiating user never comes from the browser. */
export function memberUsageQuery(workspaceId: string, userId: string, period: string) {
  return sql`
  WITH latest AS (
    SELECT DISTINCT ON (generation_job_id,attempt_count) e.*,
      min(occurred_at) OVER(PARTITION BY generation_job_id,attempt_count) AS call_at
    FROM usage_event e WHERE workspace_id=${workspaceId}::uuid AND created_by_user_id=${userId}
    ORDER BY generation_job_id,attempt_count,call_index DESC
  ), calls AS (
    SELECT call_at AS at,provider_cost_usd AS cost,total_tokens,operation FROM latest
    UNION ALL
    SELECT provider_dispatched_at,NULL::numeric,NULL::numeric,operation FROM generation_job j
    WHERE workspace_id=${workspaceId}::uuid AND created_by_user_id=${userId} AND provider_dispatched_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM latest e WHERE e.generation_job_id=j.id AND e.attempt_count=coalesce(j.provider_dispatched_attempt,j.attempt_count))
    UNION ALL
    SELECT created_at,cost_usd,total_tokens,'assistant' FROM workspace_ai_chat_call
    WHERE workspace_id=${workspaceId}::uuid AND user_id=${userId}
  ), scoped AS (SELECT *, (${period}='lifetime' OR at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS included FROM calls)
  SELECT coalesce(sum(cost) FILTER(WHERE included),0)::text AS "spentUsd", count(*) FILTER(WHERE cost IS NULL)::int AS unresolved,
    count(*) FILTER(WHERE included)::int AS requests, coalesce(sum(total_tokens) FILTER(WHERE included),0)::text AS "totalTokens",
    count(*) FILTER(WHERE included AND operation IN ('generate_image','edit_image','refine_image','remove_background'))::int AS images,
    count(*) FILTER(WHERE included AND operation='generate_video')::int AS videos,
    count(*) FILTER(WHERE included AND operation='assistant')::int AS assistant
  FROM scoped`;
}
export async function readMemberUsage(
  db: Pick<BudgetTransaction, 'execute'>,
  workspaceId: string,
  userId: string,
  period: string,
) {
  const result = await db.execute(memberUsageQuery(workspaceId, userId, period));
  return result.rows[0] as {
    spentUsd: string;
    unresolved: number;
    requests: number;
    totalTokens: string;
    images: number;
    videos: number;
    assistant: number;
  };
}
