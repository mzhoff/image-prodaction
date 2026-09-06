import type { RuntimeV2Compatibility } from '../contracts/runtime-v2-descriptor-contracts';
import type { RuntimeV2UpdatePolicy } from '../contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';

export function normalizeRuntimePipelineReference(value: string) {
  const trimmed = value.trim();
  if (/^pln_[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) return trimmed;
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new RuntimeV2Error('invalid_pipeline_reference', 'Use a published pipeline ID or link.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new RuntimeV2Error('invalid_pipeline_reference', 'Use a pipeline link without credentials or query parameters.');
  // Parse only; never fetch user-provided URLs (including loopback/private hosts).
  const match = /^\/(?:v1\/pipelines|pipelines|pipeline-playground)\/(pln_[A-Za-z0-9_-]{8,128})\/?$/.exec(url.pathname);
  if (!match?.[1]) throw new RuntimeV2Error('invalid_pipeline_reference', 'The link must identify a published pipeline.');
  return match[1];
}
export function compareRuntimeVersions(input: {
  pinned: { checksum: string; inputSchemaChecksum: string | null; outputSchemaChecksum: string | null; capabilityKey: string | null; semantic: unknown };
  candidate: { checksum: string; inputSchemaChecksum: string | null; outputSchemaChecksum: string | null; capabilityKey: string | null; semantic: unknown };
  updatePolicy: RuntimeV2UpdatePolicy;
}): RuntimeV2Compatibility {
  const { pinned, candidate } = input;
  const boundary = (a: string | null, b: string | null) => !a || !b ? 'UNKNOWN' : a === b ? 'COMPATIBLE' : 'INCOMPATIBLE';
  const inputCompatibility = boundary(pinned.inputSchemaChecksum, candidate.inputSchemaChecksum);
  const outputCompatibility = boundary(pinned.outputSchemaChecksum, candidate.outputSchemaChecksum);
  const capability = !pinned.capabilityKey || !candidate.capabilityKey ? 'UNKNOWN' : pinned.capabilityKey === candidate.capabilityKey ? 'COMPATIBLE' : 'INCOMPATIBLE';
  const semantic = stableJson(pinned.semantic) === stableJson(candidate.semantic) ? 'COMPATIBLE' : 'INCOMPATIBLE';
  const structural = [inputCompatibility, outputCompatibility, semantic, capability].includes('INCOMPATIBLE') ? 'INCOMPATIBLE' : [inputCompatibility, outputCompatibility, capability].includes('UNKNOWN') ? 'UNKNOWN' : 'COMPATIBLE';
  const behavioralChange = pinned.checksum !== candidate.checksum;
  const reasons = input.updatePolicy === 'PINNED' ? ['manual_update_policy'] : [];
  if (structural !== 'COMPATIBLE') reasons.push('contract_compatibility_unproven');
  if (behavioralChange) reasons.push('behavioral_release_gate_unavailable');
  reasons.push('cost_compatibility_unproven');
  return { structural, input: inputCompatibility, output: outputCompatibility, semantic, capability,
    behavioralChange, costChange: 'UNKNOWN', autoRepinAllowed: false, autoRepinDeniedReasons: reasons,
    changeSummary: null, estimatedCostDeltaUsd: null };
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
