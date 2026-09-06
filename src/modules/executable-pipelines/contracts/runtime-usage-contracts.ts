import { z } from 'zod';

export const runtimeUsdSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/);
const tokens = z.string().regex(/^(?:0|[1-9]\d{0,19})$/).nullable();
export const runtimeCostEnforcementSchema = z.enum(['UNSUPPORTED', 'ESTIMATED', 'ENFORCED']);
export const runtimeCostEstimateSchema = z.object({
  min: runtimeUsdSchema,
  max: runtimeUsdSchema,
  pricingSnapshotId: z.string().min(1).max(255),
  confidence: z.enum(['ESTIMATED', 'UPPER_BOUND', 'DETERMINISTIC']),
}).strict();
export const runtimeCostSnapshotSchema = z.object({
  requestMaximumProviderCostUsd: runtimeUsdSchema.nullable(),
  grantMaximumProviderCostUsd: runtimeUsdSchema.nullable(),
  effectiveMaximumProviderCostUsd: runtimeUsdSchema.nullable(),
  mode: z.enum(['STRICT', 'BEST_EFFORT']),
  enforcement: runtimeCostEnforcementSchema,
  estimate: runtimeCostEstimateSchema.nullable(),
  hasProviderCalls: z.boolean(),
}).strict();
export const runtimeUsageSchema = z.object({
  state: z.enum(['PENDING', 'PARTIAL', 'COMPLETE', 'UNAVAILABLE']),
  currency: z.literal('USD'),
  inputTokens: tokens,
  outputTokens: tokens,
  totalTokens: tokens,
  actualProviderCostUsd: runtimeUsdSchema.nullable(),
  knownProviderCostUsd: runtimeUsdSchema.nullable(),
  estimatedProviderCostUsd: runtimeCostEstimateSchema.nullable(),
  providerCallCount: z.number().int().nonnegative(),
  pricedCallCount: z.number().int().nonnegative(),
}).strict();

export type RuntimeUsage = z.infer<typeof runtimeUsageSchema>;
export type RuntimeCostEstimate = z.infer<typeof runtimeCostEstimateSchema>;
export type RuntimeCostSnapshot = z.infer<typeof runtimeCostSnapshotSchema>;
