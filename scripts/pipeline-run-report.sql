-- Run with psql. Values are passed separately so they do not become SQL text:
--   psql "$DATABASE_URL" \
--     -v pipeline_public_id=pln_REPLACE \
--     -v pipeline_version=1 \
--     -v source_application=local-e2e \
--     -f scripts/pipeline-run-report.sql
--
-- This report covers the latest 20 runs for one pinned consumer cohort. Runtime
-- state, attempts, provider/model, cost, duration, and the image artifact shape
-- are present in the current schema. Human QA and manual-correction decisions
-- are not persisted yet; the final two NULL columns make that gap explicit.

\set ON_ERROR_STOP on

\if :{?pipeline_public_id}
\else
  \echo 'pipeline_public_id is required'
  \quit 64
\endif

\if :{?pipeline_version}
\else
  \echo 'pipeline_version is required'
  \quit 64
\endif

\if :{?source_application}
\else
  \echo 'source_application is required'
  \quit 64
\endif

WITH selected_runs AS (
  SELECT
    pr.*,
    pv.checksum AS pipeline_checksum,
    pv.input_schema_checksum,
    pv.output_schema_checksum
  FROM pipeline_run AS pr
  INNER JOIN pipeline_endpoint AS pe
    ON pe.pipeline_id = pr.pipeline_id
  INNER JOIN pipeline_version AS pv
    ON pv.id = pr.pipeline_version_id
  WHERE pe.public_id = :'pipeline_public_id'
    AND pr.pipeline_version = CAST(:'pipeline_version' AS integer)
    AND pr.source_application = :'source_application'
  ORDER BY pr.created_at DESC, pr.id DESC
  LIMIT 20
), generation_rollup AS (
  SELECT
    gj.metadata ->> 'pipelineRunId' AS run_id,
    string_agg(DISTINCT gj.provider, ', ' ORDER BY gj.provider) AS providers,
    string_agg(DISTINCT gj.model_id, ', ' ORDER BY gj.model_id) AS models,
    sum(gj.provider_cost_usd) AS generation_cost_usd,
    sum(gj.total_tokens) AS generation_tokens
  FROM generation_job AS gj
  WHERE gj.metadata ? 'pipelineRunId'
  GROUP BY gj.metadata ->> 'pipelineRunId'
), artifact_rollup AS (
  SELECT
    sr.id AS run_id,
    jsonb_path_query_first(
      sr.result_payload -> 'outputs',
      'lax $.** ? (@.kind == "image")'
    ) AS image_artifact
  FROM selected_runs AS sr
), detailed AS (
  SELECT
    sr.id AS run_id,
    sr.created_at,
    sr.started_at,
    sr.finished_at,
    sr.status,
    sr.attempt_count,
    greatest(sr.attempt_count - 1, 0) AS retry_count,
    sr.error_code,
    sr.actual_cost_usd,
    sr.total_tokens,
    round(
      extract(epoch FROM (sr.finished_at - sr.created_at))::numeric,
      3
    ) AS cycle_seconds,
    round(
      extract(epoch FROM (sr.finished_at - sr.started_at))::numeric,
      3
    ) AS execution_seconds,
    sr.pipeline_checksum,
    sr.input_schema_checksum,
    sr.output_schema_checksum,
    gr.providers,
    gr.models,
    gr.generation_cost_usd,
    gr.generation_tokens,
    sr.result_payload -> 'outputs' IS NOT NULL
      AND sr.result_payload -> 'outputs' <> '{}'::jsonb AS output_nonempty,
    CASE
      WHEN ar.image_artifact IS NULL THEN NULL
      ELSE
        ar.image_artifact ->> 'kind' = 'image'
        AND coalesce(ar.image_artifact ->> 'assetId', '') <> ''
        AND coalesce(ar.image_artifact ->> 'mimeType', '') ~ '^image/(png|jpeg|webp|gif)$'
        AND coalesce(ar.image_artifact ->> 'checksumSha256', '') ~ '^[a-fA-F0-9]{64}$'
        AND coalesce(ar.image_artifact ->> 'sizeBytes', '') ~ '^[1-9][0-9]*$'
        AND coalesce(ar.image_artifact ->> 'width', '') ~ '^[1-9][0-9]*$'
        AND coalesce(ar.image_artifact ->> 'height', '') ~ '^[1-9][0-9]*$'
        AND coalesce(ar.image_artifact ->> 'contentUrl', '') <> ''
    END AS image_asset_contract_pass,
    NULL::boolean AS human_qa_pass,
    NULL::boolean AS manual_correction_required
  FROM selected_runs AS sr
  LEFT JOIN generation_rollup AS gr
    ON gr.run_id = sr.id::text
  LEFT JOIN artifact_rollup AS ar
    ON ar.run_id = sr.id
)
SELECT
  count(*) AS sampled_runs,
  count(*) = 20 AS twenty_run_gate_complete,
  count(*) FILTER (WHERE status = 'succeeded') AS succeeded_runs,
  count(*) FILTER (WHERE status = 'failed') AS failed_runs,
  count(*) FILTER (WHERE status = 'canceled') AS canceled_runs,
  round(
    count(*) FILTER (WHERE status = 'succeeded')::numeric
      / nullif(count(*), 0),
    4
  ) AS stability_rate,
  sum(retry_count) AS retries,
  round(avg(actual_cost_usd) FILTER (WHERE status = 'succeeded'), 8)
    AS average_success_cost_usd,
  round(avg(cycle_seconds) FILTER (WHERE status = 'succeeded'), 3)
    AS average_success_cycle_seconds,
  round(
    (
      percentile_cont(0.95) WITHIN GROUP (ORDER BY cycle_seconds)
        FILTER (WHERE status = 'succeeded')
    )::numeric,
    3
  ) AS p95_success_cycle_seconds,
  count(*) FILTER (WHERE output_nonempty) AS nonempty_output_runs,
  count(*) FILTER (WHERE image_asset_contract_pass) AS valid_image_asset_runs,
  count(*) FILTER (WHERE image_asset_contract_pass = false) AS invalid_image_asset_runs,
  NULL::boolean AS human_qa_pass_not_recorded,
  NULL::integer AS manual_corrections_not_recorded
FROM detailed;

WITH selected_runs AS (
  SELECT
    pr.*,
    pv.checksum AS pipeline_checksum,
    pv.input_schema_checksum,
    pv.output_schema_checksum
  FROM pipeline_run AS pr
  INNER JOIN pipeline_endpoint AS pe
    ON pe.pipeline_id = pr.pipeline_id
  INNER JOIN pipeline_version AS pv
    ON pv.id = pr.pipeline_version_id
  WHERE pe.public_id = :'pipeline_public_id'
    AND pr.pipeline_version = CAST(:'pipeline_version' AS integer)
    AND pr.source_application = :'source_application'
  ORDER BY pr.created_at DESC, pr.id DESC
  LIMIT 20
), generation_rollup AS (
  SELECT
    gj.metadata ->> 'pipelineRunId' AS run_id,
    string_agg(DISTINCT gj.provider, ', ' ORDER BY gj.provider) AS providers,
    string_agg(DISTINCT gj.model_id, ', ' ORDER BY gj.model_id) AS models
  FROM generation_job AS gj
  WHERE gj.metadata ? 'pipelineRunId'
  GROUP BY gj.metadata ->> 'pipelineRunId'
)
SELECT
  sr.id AS run_id,
  sr.created_at,
  sr.status,
  sr.attempt_count,
  greatest(sr.attempt_count - 1, 0) AS retry_count,
  sr.error_code,
  sr.actual_cost_usd,
  sr.total_tokens,
  round(extract(epoch FROM (sr.finished_at - sr.created_at))::numeric, 3)
    AS cycle_seconds,
  gr.providers,
  gr.models,
  sr.pipeline_checksum,
  sr.input_schema_checksum,
  sr.output_schema_checksum,
  sr.result_payload -> 'outputs' IS NOT NULL
    AND sr.result_payload -> 'outputs' <> '{}'::jsonb AS output_nonempty,
  NULL::boolean AS human_qa_pass,
  NULL::boolean AS manual_correction_required
FROM selected_runs AS sr
LEFT JOIN generation_rollup AS gr
  ON gr.run_id = sr.id::text
ORDER BY sr.created_at DESC, sr.id DESC;
