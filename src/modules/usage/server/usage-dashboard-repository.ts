import { getPostgresPool } from '@/shared/db/client';
import type { UsageDashboardRow, UsagePeriod } from '../contracts/usage-dashboard';

/** Read-only local projection of product ledgers and the installed ChatModule schema.
 * Every source is scoped before aggregation. No messages, prompts, credentials or raw responses leave SQL.
 * call_index is a revision, not another paid call; select its latest value BEFORE applying dates.
 */
export const USAGE_DASHBOARD_SQL = `
WITH observations AS (
  SELECT DISTINCT ON (generation_job_id, attempt_count) *,
    min(occurred_at) OVER (PARTITION BY generation_job_id, attempt_count) AS call_at
  FROM usage_event WHERE workspace_id = $1::uuid
  ORDER BY generation_job_id, attempt_count, call_index DESC
), calls AS (
  SELECT call_at AS at, provider, model_id, operation,
    CASE WHEN succeeded THEN 'success' ELSE 'failed' END AS outcome,
    input_tokens, output_tokens, total_tokens, provider_cost_usd AS cost
  FROM observations
  UNION ALL
  SELECT j.provider_dispatched_at, j.provider, j.model_id, j.operation, 'unknown',
    NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
  FROM generation_job j
  WHERE j.workspace_id = $1::uuid AND j.provider_dispatched_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM observations e WHERE e.generation_job_id = j.id
      AND e.attempt_count = coalesce(j.provider_dispatched_attempt, j.attempt_count))
  UNION ALL
  SELECT l.created_at, l.provider, l.model, 'assistant',
    CASE WHEN l.status = 'success' THEN 'success' WHEN l.status IN ('failed','cancelled') THEN 'failed' ELSE 'unknown' END,
    CASE WHEN l.total_tokens > 0 THEN l.prompt_tokens ELSE NULL END,
    CASE WHEN l.total_tokens > 0 THEN l.completion_tokens ELSE NULL END,
    nullif(l.total_tokens, 0), nullif(l.cost_usd, 0)
  FROM chat_llm_calls l JOIN chat_conversations c ON c.id = l.conversation_id
  WHERE c.tenant_id = $1::text AND c.product_id = 'image-production'
), classified AS (
  SELECT *, CASE
    WHEN operation = 'assistant' THEN 'assistant'
    WHEN operation IN ('generate_image','edit_image','refine_image','remove_background','analyze_image','describe_subject','describe_location') THEN 'image'
    WHEN operation IN ('generate_text','format_telegram_text') THEN 'text'
    WHEN operation IN ('generate_speech','transcribe_audio') THEN 'audio'
    WHEN operation = 'generate_video' THEN 'video' ELSE 'other' END AS category
  FROM calls WHERE at >= $2::timestamptz AND at < $3::timestamptz
), measured AS (
  SELECT to_char(at AT TIME ZONE $4, 'YYYY-MM-DD') AS day, provider, model_id, category,
    count(*) AS requests, count(*) FILTER (WHERE outcome = 'success') AS succeeded,
    count(*) FILTER (WHERE outcome = 'failed') AS failed, count(*) FILTER (WHERE outcome = 'unknown') AS unconfirmed,
    sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens, sum(total_tokens) AS total_tokens, sum(cost) AS cost,
    count(*) FILTER (WHERE cost IS NULL) AS unknown_cost,
    count(*) FILTER (WHERE input_tokens IS NULL OR output_tokens IS NULL OR total_tokens IS NULL) AS unknown_tokens,
    0::bigint AS images, 0::bigint AS texts, 0::bigint AS audio, 0::bigint AS video
  FROM classified GROUP BY 1,2,3,4
  UNION ALL
  SELECT to_char(coalesce(finished_at, created_at) AT TIME ZONE $4, 'YYYY-MM-DD'), provider, model_id,
    CASE WHEN operation IN ('generate_image','edit_image','refine_image','remove_background') THEN 'image'
      WHEN operation IN ('generate_text','format_telegram_text') THEN 'text'
      WHEN operation = 'generate_speech' THEN 'audio' ELSE 'video' END,
    0,0,0,0, NULL,NULL,NULL,NULL,0,0,
    count(*) FILTER (WHERE operation IN ('generate_image','edit_image','refine_image','remove_background')),
    count(*) FILTER (WHERE operation IN ('generate_text','format_telegram_text')),
    count(*) FILTER (WHERE operation = 'generate_speech'), count(*) FILTER (WHERE operation = 'generate_video')
  FROM generation_job WHERE workspace_id = $1::uuid AND status = 'succeeded'
    AND operation IN ('generate_image','edit_image','refine_image','remove_background','generate_text','format_telegram_text','generate_speech','generate_video')
    AND coalesce(finished_at, created_at) >= $2::timestamptz AND coalesce(finished_at, created_at) < $3::timestamptz
  GROUP BY 1,2,3,4
)
SELECT day, provider, model_id AS "modelId", category,
  sum(requests)::int AS requests, sum(succeeded)::int AS succeeded, sum(failed)::int AS failed, sum(unconfirmed)::int AS unconfirmed,
  sum(input_tokens)::text AS "inputTokens", sum(output_tokens)::text AS "outputTokens", sum(total_tokens)::text AS "totalTokens", sum(cost)::text AS "costUsd",
  sum(unknown_cost)::int AS "unknownCostRequests", sum(unknown_tokens)::int AS "unknownTokenRequests",
  sum(images)::int AS images, sum(texts)::int AS texts, sum(audio)::int AS audio, sum(video)::int AS video
FROM measured GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`;

export async function readUsageDashboardRows(workspaceId: string, period: UsagePeriod): Promise<UsageDashboardRow[]> {
  const result = await getPostgresPool().query<UsageDashboardRow>(USAGE_DASHBOARD_SQL, [workspaceId, period.start, period.end, period.timezone]);
  return result.rows;
}
