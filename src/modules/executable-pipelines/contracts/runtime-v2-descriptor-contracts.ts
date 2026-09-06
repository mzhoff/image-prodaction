import { z } from 'zod';
import { runtimeV2ChecksumSchema, runtimeV2CostPolicySchema, runtimeV2ExecutionPolicySchema, runtimeV2UpdatePolicySchema } from './runtime-v2-contracts';
import { runtimeV2SemanticContractSchema, runtimeV2SemanticJsonSchema } from './runtime-v2-semantic-schema';

export const runtimeV2FieldSchema = z.object({
  kind: z.enum(['audio', 'boolean', 'image', 'image_collection', 'json', 'number', 'publication', 'text', 'text_collection']),
  required: z.boolean(), description: z.string().optional(), defaultValue: z.json().optional(), schema: runtimeV2SemanticJsonSchema.optional(),
}).strict();
export const runtimeV2BoundarySchema = z.object({
  fields: z.record(z.string(), runtimeV2FieldSchema),
  schemaChecksum: runtimeV2ChecksumSchema.nullable(),
  semanticContract: runtimeV2SemanticContractSchema.nullable(),
}).strict();
export const runtimeV2VersionSchema = z.object({
  version: z.number().int().positive(), checksum: runtimeV2ChecksumSchema,
  inputSchemaChecksum: runtimeV2ChecksumSchema.nullable(), outputSchemaChecksum: runtimeV2ChecksumSchema.nullable(),
  capabilityKey: z.string().nullable(), publishedAt: z.iso.datetime(),
}).strict();
export const runtimeV2PipelineSchema = z.object({
  publicId: z.string(), name: z.string(), description: z.string().nullable(),
  latest: runtimeV2VersionSchema, input: runtimeV2BoundarySchema, output: runtimeV2BoundarySchema,
}).strict();
export const runtimeV2PipelineVersionDescriptorSchema = z.object({
  pipelinePublicId: z.string(), pipelineName: z.string(), version: runtimeV2VersionSchema,
  input: runtimeV2BoundarySchema, output: runtimeV2BoundarySchema,
}).strict();
export const runtimeV2CompatibilitySchema = z.object({
  structural: z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN']),
  input: z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN']),
  output: z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN']),
  semantic: z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN']),
  capability: z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN']),
  behavioralChange: z.boolean(), costChange: z.literal('UNKNOWN'),
  autoRepinAllowed: z.boolean(), autoRepinDeniedReasons: z.array(z.string()),
  changeSummary: z.string().nullable(), estimatedCostDeltaUsd: z.null(),
}).strict();
export const runtimeV2GrantSchema = z.object({
  id: z.uuid(), serviceClientId: z.uuid(), pipelinePublicId: z.string(), pipelineName: z.string(),
  capabilityKey: z.string(), enabled: z.boolean(), revision: z.number().int().positive(),
  updatePolicy: runtimeV2UpdatePolicySchema, executionPolicy: runtimeV2ExecutionPolicySchema, costPolicy: runtimeV2CostPolicySchema,
  pinned: runtimeV2VersionSchema, input: runtimeV2BoundarySchema, output: runtimeV2BoundarySchema,
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export const runtimeV2UpdatesSchema = z.object({
  grantId: z.uuid(), pipelinePublicId: z.string(), capabilityKey: z.string(), grantRevision: z.number().int().positive(),
  pinned: runtimeV2VersionSchema, latest: runtimeV2VersionSchema,
  rollbackVersions: z.array(runtimeV2VersionSchema),
  updateAvailable: z.boolean(), compatibility: runtimeV2CompatibilitySchema,
}).strict();
export type RuntimeV2Version = z.infer<typeof runtimeV2VersionSchema>;
export type RuntimeV2Pipeline = z.infer<typeof runtimeV2PipelineSchema>;
export type RuntimeV2PipelineVersionDescriptor = z.infer<typeof runtimeV2PipelineVersionDescriptorSchema>;
export type RuntimeV2Grant = z.infer<typeof runtimeV2GrantSchema>;
export type RuntimeV2Updates = z.infer<typeof runtimeV2UpdatesSchema>;
export type RuntimeV2Compatibility = z.infer<typeof runtimeV2CompatibilitySchema>;
