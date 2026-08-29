import { z } from 'zod';
import { normalizePipelineContractFields } from '@/entities/production-graph/model/pipeline-contract-fields';
import type {
  PipelineContractField,
  PipelineContractValue,
} from '@/entities/production-graph/model/types';

const pipelineContractDefaultValueSchema: z.ZodType<PipelineContractValue> = createDefaultValueSchema(0);

const pipelineContractFieldSchema: z.ZodType<PipelineContractField> = z.lazy(() => z.object({
  id: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  key: z.string().trim().min(1).max(80).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  kind: z.enum(['text', 'number', 'boolean', 'image', 'json']),
  required: z.boolean(),
  description: z.string().trim().max(500).optional(),
  defaultValue: pipelineContractDefaultValueSchema.optional(),
  fields: z.array(pipelineContractFieldSchema).max(24).optional(),
}).strict());

export const pipelineContractFieldsSchema = z.array(pipelineContractFieldSchema).max(24)
  .transform((fields) => normalizePipelineContractFields(fields));

function createDefaultValueSchema(depth: number): z.ZodType<PipelineContractValue> {
  const scalar = z.union([
    z.string().max(4_000),
    z.number().finite().min(-1_000_000_000).max(1_000_000_000),
    z.boolean(),
    z.null(),
  ]);
  if (depth >= 3) return scalar;
  const child: z.ZodType<PipelineContractValue> = z.lazy(() => createDefaultValueSchema(depth + 1));
  return z.union([
    scalar,
    z.array(child).max(24),
    z.record(z.string().min(1).max(80), child)
      .refine((value) => Object.keys(value).length <= 24, 'Default objects are limited to 24 fields.'),
  ]);
}
