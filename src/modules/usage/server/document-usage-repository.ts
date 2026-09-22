import { getPostgresPool } from '@/shared/db/client';
import type { DocumentUsageAmount, DocumentUsageCategory } from '../contracts/document-usage';
import { usageCallsSql } from './usage-calls-sql';

export const DOCUMENT_USAGE_SQL = `${usageCallsSql(true)}, classified AS (
  SELECT cost, CASE
    WHEN operation = 'assistant' THEN 'assistant'
    WHEN operation IN ('generate_text','format_telegram_text') THEN 'text'
    WHEN operation IN ('generate_image','edit_image','refine_image','remove_background','analyze_image','describe_subject','describe_location') THEN 'image'
    WHEN operation IN ('generate_speech','transcribe_audio') THEN 'audio'
    WHEN operation = 'generate_video' THEN 'video' ELSE 'other' END AS category
  FROM calls WHERE at < $2::timestamptz
)
SELECT category, count(*)::int AS requests,
  CASE WHEN count(*) = 0 THEN '0' ELSE sum(cost)::text END AS "costUsd",
  count(*) FILTER (WHERE cost IS NULL)::int AS "unknownCostRequests"
FROM classified GROUP BY GROUPING SETS ((), (category))`;

export async function readDocumentUsage(scope: {
  workspaceId: string; documentId: string; updatedAt: string;
}) {
  return (await getPostgresPool().query<DocumentUsageAmount & { category: DocumentUsageCategory | null }>(
    DOCUMENT_USAGE_SQL,
    [scope.workspaceId, scope.updatedAt, scope.documentId],
  )).rows;
}
