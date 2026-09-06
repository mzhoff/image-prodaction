import { text, uuid } from 'drizzle-orm/pg-core';

/** Nullable to preserve legacy jobs; FK constraints live in the additive Runtime migration. */
export function runtimeUsageColumns() {
  return {
    pipelineRunId: uuid('pipeline_run_id'),
    pipelineNodeRunId: uuid('pipeline_node_run_id'),
    serviceClientId: uuid('service_client_id'),
    grantId: uuid('grant_id'),
    capabilityKey: text('capability_key'),
  };
}
