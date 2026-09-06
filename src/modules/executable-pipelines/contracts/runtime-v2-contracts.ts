import { z } from 'zod';

export const runtimeV2Scopes = [
  'pipeline.catalog.read', 'pipeline.descriptor.read', 'pipeline.run.create',
  'pipeline.run.read', 'pipeline.run.cancel', 'pipeline.artifact.read',
  'pipeline.grants.manage',
  'pipeline.asset.write',
] as const;
export const runtimeV2ScopeSchema = z.enum(runtimeV2Scopes);
export type RuntimeV2Scope = z.infer<typeof runtimeV2ScopeSchema>;
export const runtimeV2DefaultScopes = runtimeV2Scopes.filter((scope) => scope !== 'pipeline.grants.manage' && scope !== 'pipeline.asset.write');
const scopes = z.array(runtimeV2ScopeSchema).min(1).max(runtimeV2Scopes.length)
  .refine((value) => new Set(value).size === value.length).meta({ uniqueItems: true });
const label = z.string().trim().min(1).max(120);
const opaque = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
export const runtimeV2ChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const runtimeV2DecimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/);
export const runtimeV2CostPolicySchema = z.object({
  maximumProviderCostUsd: runtimeV2DecimalSchema.nullable().default(null),
  mode: z.enum(['STRICT', 'BEST_EFFORT']).default('STRICT'),
}).strict();
export const runtimeV2ExecutionPolicySchema = z.object({ maxAttempts: z.number().int().min(1).max(3).default(1) }).strict();
export const runtimeV2UpdatePolicySchema = z.enum(['PINNED', 'AUTO_COMPATIBLE', 'FOLLOW_LATEST_DEV']);
export const runtimeV2CreateClientSchema = z.object({
  displayName: label,
  sourceApplication: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/),
  externalWorkspaceRef: opaque,
  scopes: scopes.default(runtimeV2DefaultScopes),
}).strict();
export const runtimeV2IssueCredentialSchema = z.object({
  label,
  scopes: scopes.nullable().default(null),
  expiresAt: z.iso.datetime().nullable().default(null),
}).strict();
export const runtimeV2SetEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export const runtimeV2CreateGrantSchema = z.object({
  pipeline: z.string().trim().min(1).max(2048),
  capabilityKey: z.string().trim().min(1).max(160).regex(/^[a-z][a-z0-9._-]+$/),
  version: z.number().int().positive(),
  checksum: runtimeV2ChecksumSchema,
  inputSchemaChecksum: runtimeV2ChecksumSchema,
  outputSchemaChecksum: runtimeV2ChecksumSchema,
  updatePolicy: runtimeV2UpdatePolicySchema.default('PINNED'),
  executionPolicy: runtimeV2ExecutionPolicySchema.default({ maxAttempts: 1 }),
  costPolicy: runtimeV2CostPolicySchema.default({ maximumProviderCostUsd: null, mode: 'STRICT' }),
}).strict();
export const runtimeV2RepinSchema = z.object({
  expectedGrantRevision: z.number().int().positive(),
  version: z.number().int().positive(),
  checksum: runtimeV2ChecksumSchema,
  inputSchemaChecksum: runtimeV2ChecksumSchema,
  outputSchemaChecksum: runtimeV2ChecksumSchema,
}).strict();
export const runtimeV2GrantEnabledSchema = runtimeV2SetEnabledSchema.extend({ expectedGrantRevision: z.number().int().positive() });
export const runtimeV2ClientSchema = z.object({
  id: z.uuid(), workspaceId: z.uuid(), displayName: z.string(), sourceApplication: z.string(),
  externalWorkspaceRef: z.string(), enabled: z.boolean(), scopes: z.array(runtimeV2ScopeSchema),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export const runtimeV2CredentialSchema = z.object({
  id: z.uuid(), serviceClientId: z.uuid(), label: z.string(), tokenPrefix: z.string(),
  scopes: z.array(runtimeV2ScopeSchema).nullable(), createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(), lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
}).strict();
export type RuntimeV2Client = z.infer<typeof runtimeV2ClientSchema>;
export type RuntimeV2Credential = z.infer<typeof runtimeV2CredentialSchema>;
export type RuntimeV2CreateClient = z.infer<typeof runtimeV2CreateClientSchema>;
export type RuntimeV2IssueCredential = z.infer<typeof runtimeV2IssueCredentialSchema>;
export type RuntimeV2CreateGrant = z.infer<typeof runtimeV2CreateGrantSchema>;
export type RuntimeV2Repin = z.infer<typeof runtimeV2RepinSchema>;
export type RuntimeV2CostPolicy = z.infer<typeof runtimeV2CostPolicySchema>;
export type RuntimeV2ExecutionPolicy = z.infer<typeof runtimeV2ExecutionPolicySchema>;
export type RuntimeV2UpdatePolicy = z.infer<typeof runtimeV2UpdatePolicySchema>;
