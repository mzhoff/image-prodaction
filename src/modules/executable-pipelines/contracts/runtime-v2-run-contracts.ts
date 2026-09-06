import { z } from 'zod';
import { runtimeV2ChecksumSchema, runtimeV2DecimalSchema } from './runtime-v2-contracts';
import { runtimeCostSnapshotSchema, runtimeUsageSchema } from './runtime-usage-contracts';

const opaqueId = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const MAX_CONSUMER_REFERENCE_FIELDS = 16;
export const runtimeV2RunRequestSchema = z.object({
  input: z.record(z.string().max(160), z.json()),
  expectedGrantRevision: z.number().int().positive(),
  correlationId: opaqueId.optional(),
  consumerReference: z.record(z.string().max(80), opaqueId)
    .refine((v) => Object.keys(v).length <= MAX_CONSUMER_REFERENCE_FIELDS)
    .meta({ maxProperties: MAX_CONSUMER_REFERENCE_FIELDS }).optional(),
  maximumProviderCostUsd: runtimeV2DecimalSchema.optional(),
}).strict();

export const runtimeV2RunSnapshotSchema = z.object({
  publicId: z.string(),
  capabilityKey: z.string(),
  sourceApplication: z.string(),
  externalWorkspaceRef: z.string(),
  checksum: runtimeV2ChecksumSchema,
  inputSchemaChecksum: runtimeV2ChecksumSchema,
  outputSchemaChecksum: runtimeV2ChecksumSchema,
  correlationId: opaqueId.nullable(),
  consumerReference: z.record(z.string(), opaqueId).nullable(),
  cost: runtimeCostSnapshotSchema,
}).strict();

export const runtimeV2RunSchema = z.object({
  id: z.uuid(),
  serviceClientId: z.uuid(),
  grantId: z.uuid(),
  grantRevision: z.number().int().positive(),
  pipeline: z.object({
    publicId: z.string(), version: z.number().int().positive(), capabilityKey: z.string(),
    checksum: runtimeV2ChecksumSchema, inputSchemaChecksum: runtimeV2ChecksumSchema,
    outputSchemaChecksum: runtimeV2ChecksumSchema,
  }).strict(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']),
  outputs: z.record(z.string(), z.json()).nullable(),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  idempotentReplay: z.boolean(),
  correlationId: opaqueId.nullable(),
  consumerReference: z.record(z.string(), opaqueId).nullable(),
  cost: runtimeCostSnapshotSchema,
  usage: runtimeUsageSchema,
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict().nullable(),
  createdAt: z.iso.datetime(), startedAt: z.iso.datetime().nullable(), finishedAt: z.iso.datetime().nullable(),
  statusUrl: z.string(),
}).strict();

export type RuntimeV2RunRequest = z.infer<typeof runtimeV2RunRequestSchema>;
export type RuntimeV2RunSnapshot = z.infer<typeof runtimeV2RunSnapshotSchema>;
export type RuntimeV2Run = z.infer<typeof runtimeV2RunSchema>;
