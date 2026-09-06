import { z } from 'zod';
import type { SemanticJsonSchema } from '@/shared/contracts/semantic-contract';

const description = { description: z.string().optional(), title: z.string().optional() };
/** Executable semantic JSON Schema subset; no arbitrary extensions are claimed executable. */
export const runtimeV2SemanticJsonSchema: z.ZodType<SemanticJsonSchema> = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ ...description, type: z.literal('string'), enum: z.array(z.string()).optional(), maxLength: z.number().optional(), minLength: z.number().optional(), pattern: z.string().optional() }).strict(),
  z.object({ ...description, type: z.literal('number'), enum: z.array(z.number()).optional(), maximum: z.number().optional(), minimum: z.number().optional() }).strict(),
  z.object({ ...description, type: z.literal('integer'), enum: z.array(z.number()).optional(), maximum: z.number().optional(), minimum: z.number().optional() }).strict(),
  z.object({ ...description, type: z.literal('boolean'), enum: z.array(z.boolean()).optional() }).strict(),
  z.object({ ...description, type: z.literal('array'), items: runtimeV2SemanticJsonSchema, maxItems: z.number().optional(), minItems: z.number().optional() }).strict(),
  z.object({ ...description, type: z.literal('object'), additionalProperties: z.literal(false), properties: z.record(z.string(), runtimeV2SemanticJsonSchema), required: z.array(z.string()).optional() }).strict(),
]));
export const runtimeV2SemanticContractSchema = z.object({
  contractKey: z.string(), contractRef: z.string(), contractVersion: z.string(),
  schema: runtimeV2SemanticJsonSchema, schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
