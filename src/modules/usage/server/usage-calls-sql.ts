/** Latest physical-call observations, dispatched calls awaiting usage and assistant calls.
 * Reconciliation revisions replace previous costs; they never create another call.
 * Document scope includes all members' calls and bound assistants across browser sessions.
 * The caller authorizes document access before reading this aggregate; no chat content is returned.
 */
export function usageCallsSql(scoped = false) {
  return `WITH observations AS (
  SELECT DISTINCT ON (generation_job_id, attempt_count) *,
    min(occurred_at) OVER (PARTITION BY generation_job_id, attempt_count) AS call_at
  FROM usage_event WHERE workspace_id = $1::uuid${scoped ? ' AND document_id = $3::uuid' : ''}
  ORDER BY generation_job_id, attempt_count, call_index DESC
), calls AS (
  SELECT ${scoped ? `coalesce((SELECT j.provider_dispatched_at FROM generation_job j
    WHERE j.id = observations.generation_job_id
      AND coalesce(j.provider_dispatched_attempt, j.attempt_count) = observations.attempt_count), call_at)` : 'call_at'} AS at,
    provider, model_id, operation,
    CASE WHEN succeeded THEN 'success' ELSE 'failed' END AS outcome,
    input_tokens, output_tokens, total_tokens, provider_cost_usd AS cost
  FROM observations
  UNION ALL
  SELECT j.provider_dispatched_at, j.provider, j.model_id, j.operation, 'unknown',
    NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
  FROM generation_job j
  WHERE j.workspace_id = $1::uuid AND j.provider_dispatched_at IS NOT NULL
    ${scoped ? 'AND j.document_id = $3::uuid' : ''}
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
    ${scoped ? `AND EXISTS (
      SELECT 1 FROM chat_document_conversation b WHERE b.conversation_id = c.id
        AND b.workspace_id = $1::uuid AND b.document_id = $3::uuid AND b.user_id = c.user_id
    )` : ''}
)`;
}
