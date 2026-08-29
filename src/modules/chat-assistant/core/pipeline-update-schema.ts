import { z } from 'zod';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { compositionBlueprintsSchema } from './composition-blueprint';

const nodeKeySchema = z.string().trim().min(1).max(48).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const idSchema = z.string().trim().min(1).max(120);
const settingsSchema = z.record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 24, 'Node settings are limited to 24 fields.');
const nodeTypeSchema = z.enum(PRODUCTION_NODE_TYPES as [ProductionNodeType, ...ProductionNodeType[]]);

const pipelineUpdateEdgeSchema = z.object({
  sourceNodeRef: idSchema.optional(),
  sourceNodeKey: idSchema.optional(),
  sourcePortId: idSchema.max(80),
  targetNodeRef: idSchema.optional(),
  targetNodeKey: idSchema.optional(),
  targetPortId: idSchema.max(80),
}).strict().superRefine((edge, context) => {
  if (!edge.sourceNodeRef && !edge.sourceNodeKey) {
    context.addIssue({ code: 'custom', message: 'A source node reference is required.', path: ['sourceNodeRef'] });
  }
  if (!edge.targetNodeRef && !edge.targetNodeKey) {
    context.addIssue({ code: 'custom', message: 'A target node reference is required.', path: ['targetNodeRef'] });
  }
  if (edge.sourceNodeRef && edge.sourceNodeKey && edge.sourceNodeRef !== edge.sourceNodeKey) {
    context.addIssue({ code: 'custom', message: 'Source node aliases must match.', path: ['sourceNodeKey'] });
  }
  if (edge.targetNodeRef && edge.targetNodeKey && edge.targetNodeRef !== edge.targetNodeKey) {
    context.addIssue({ code: 'custom', message: 'Target node aliases must match.', path: ['targetNodeKey'] });
  }
}).transform((edge) => ({
  sourceNodeRef: edge.sourceNodeRef ?? edge.sourceNodeKey!,
  sourcePortId: edge.sourcePortId,
  targetNodeRef: edge.targetNodeRef ?? edge.targetNodeKey!,
  targetPortId: edge.targetPortId,
}));

export const pipelineUpdateInputSchema = z.object({
  summary: z.string().trim().min(4).max(280),
  nodes: z.array(z.object({
    key: nodeKeySchema,
    settings: settingsSchema.optional(),
    sourceAttachmentIndex: z.number().int().min(0).max(2).optional(),
    type: nodeTypeSchema,
  }).strict()).max(24).default([]),
  updates: z.array(z.object({ nodeId: idSchema, settings: settingsSchema }).strict()).max(12).default([]),
  removeEdgeIds: z.array(idSchema).max(24).default([]),
  edges: z.array(pipelineUpdateEdgeSchema).max(24).default([]),
  compositionBlueprints: compositionBlueprintsSchema,
  layout: z.object({
    columnGap: z.number().int().min(80).max(400).optional(),
    direction: z.enum(['horizontal', 'vertical']).optional(),
    originX: z.number().int().min(80).max(3_400).optional(),
    originY: z.number().int().min(80).max(3_400).optional(),
    rowGap: z.number().int().min(80).max(400).optional(),
  }).strict().optional(),
}).strict().refine((input) => (
  input.nodes.length + input.updates.length + input.removeEdgeIds.length + input.edges.length
    + input.compositionBlueprints.length > 0
), 'A pipeline update must contain at least one change.');

export type PipelineUpdateInput = z.infer<typeof pipelineUpdateInputSchema>;
