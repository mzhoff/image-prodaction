/** Server-created linkage, copied into jobs/events; never accepted from public generation DTOs. */
export interface RuntimeUsageAttribution {
  pipelineRunId: string;
  pipelineNodeRunId: string;
  serviceClientId: string;
  grantId: string;
  capabilityKey: string;
}
