import { z } from 'zod';
import { COMPOSITION_LAYER_MAX_INPUTS } from '@/entities/production-graph/model/node-definitions';
import {
  COMPOSITION_TEXT_FONT_SIZE_MAX,
  COMPOSITION_TEXT_FONT_SIZE_MIN,
  COMPOSITION_TEXT_LINE_HEIGHT_MAX,
  COMPOSITION_TEXT_LINE_HEIGHT_MIN,
} from '@/entities/production-graph/model/composition-text-constraints';

const keySchema = z.string().trim().min(1).max(48).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const refSchema = z.string().trim().min(1).max(120);
const blendModeSchema = z.enum([
  'pass-through', 'normal', 'darken', 'multiply', 'plus-darker', 'color-burn',
  'lighten', 'screen', 'plus-lighter', 'color-dodge', 'overlay', 'soft-light',
  'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
]);

const frameSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).strict().superRefine((frame, context) => {
  if (frame.x + frame.width > 1) {
    context.addIssue({ code: 'custom', message: 'x + width must not exceed 1.', path: ['width'] });
  }
  if (frame.y + frame.height > 1) {
    context.addIssue({ code: 'custom', message: 'y + height must not exceed 1.', path: ['height'] });
  }
});

const layerSchema = z.object({
  key: keySchema,
  name: z.string().trim().min(1).max(120),
  role: keySchema,
  kind: z.enum(['text', 'image']),
  source: z.object({
    nodeRef: refSchema,
    portId: z.string().trim().min(1).max(80),
  }).strict(),
  frame: frameSchema,
  zIndex: z.number().int().min(-1_000).max(1_000),
  rotation: z.number().min(-360).max(360).optional(),
  opacity: z.number().min(0).max(100).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  blendMode: blendModeSchema.optional(),
  image: z.object({
    fit: z.enum(['fit', 'fill', 'stretch']).optional(),
    preserveAspectRatio: z.boolean().optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
  }).strict().optional(),
  text: z.object({
    align: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    gradient: z.object({
      type: z.literal('linear'),
      angle: z.number().min(-360).max(360),
      stops: z.array(z.object({
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        offset: z.number().min(0).max(1),
      }).strict()).min(2).max(8),
    }).strict().optional(),
    fontFamily: z.string().trim().min(1).max(160).optional(),
    fontSize: z.number()
      .min(COMPOSITION_TEXT_FONT_SIZE_MIN)
      .max(COMPOSITION_TEXT_FONT_SIZE_MAX)
      .optional(),
    fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
    letterSpacing: z.number().min(-100).max(500).optional(),
    lineHeight: z.number()
      .min(COMPOSITION_TEXT_LINE_HEIGHT_MIN)
      .max(COMPOSITION_TEXT_LINE_HEIGHT_MAX)
      .optional(),
    sizingMode: z.enum(['auto-width', 'auto-height', 'fixed']).optional(),
  }).strict().optional(),
}).strict().superRefine((layer, context) => {
  if (layer.kind === 'text' && layer.image) {
    context.addIssue({ code: 'custom', message: 'Text layers cannot define image settings.', path: ['image'] });
  }
  if (layer.kind === 'image' && layer.text) {
    context.addIssue({ code: 'custom', message: 'Image layers cannot define text settings.', path: ['text'] });
  }
  if (layer.role === 'qr' && layer.kind !== 'image') {
    context.addIssue({ code: 'custom', message: 'The qr role must use kind "image".', path: ['kind'] });
  }
});

const groupSchema = z.object({
  key: keySchema,
  name: z.string().trim().min(1).max(120),
  layerKeys: z.array(keySchema).min(1).max(COMPOSITION_LAYER_MAX_INPUTS),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  collapsed: z.boolean().optional(),
}).strict();

const blueprintSchema = z.object({
  version: z.literal(1),
  compositionNodeRef: refSchema,
  mode: z.enum(['replace', 'merge']),
  canvas: z.object({
    width: z.number().int().min(256).max(4_096),
    height: z.number().int().min(256).max(4_096),
  }).strict(),
  layers: z.array(layerSchema).min(1).max(COMPOSITION_LAYER_MAX_INPUTS),
  groups: z.array(groupSchema).max(COMPOSITION_LAYER_MAX_INPUTS).default([]),
}).strict().superRefine((blueprint, context) => {
  addDuplicateIssues(blueprint.layers.map((layer) => layer.key), context, ['layers'], 'Layer keys');
  addDuplicateIssues(blueprint.layers.map((layer) => String(layer.zIndex)), context, ['layers'], 'Layer zIndex values');
  addDuplicateIssues(blueprint.groups.map((group) => group.key), context, ['groups'], 'Group keys');
  const knownLayerKeys = new Set(blueprint.layers.map((layer) => layer.key));
  const groupedLayerKeys = new Set<string>();
  blueprint.groups.forEach((group, groupIndex) => {
    const localLayerKeys = new Set<string>();
    group.layerKeys.forEach((layerKey, layerIndex) => {
      if (localLayerKeys.has(layerKey)) {
        context.addIssue({ code: 'custom', message: `Layer ${layerKey} is repeated in this group.`, path: ['groups', groupIndex, 'layerKeys', layerIndex] });
      }
      localLayerKeys.add(layerKey);
      if (!knownLayerKeys.has(layerKey)) {
        context.addIssue({ code: 'custom', message: `Unknown layer key ${layerKey}.`, path: ['groups', groupIndex, 'layerKeys', layerIndex] });
      }
      if (groupedLayerKeys.has(layerKey)) {
        context.addIssue({ code: 'custom', message: `Layer ${layerKey} can belong to only one group in V1.`, path: ['groups', groupIndex, 'layerKeys', layerIndex] });
      }
      groupedLayerKeys.add(layerKey);
    });
  });
});

export const compositionBlueprintsSchema = z.array(blueprintSchema)
  .max(COMPOSITION_LAYER_MAX_INPUTS)
  .default([])
  .superRefine((blueprints, context) => {
    const seenRefs = new Set<string>();
    blueprints.forEach((blueprint, index) => {
      if (seenRefs.has(blueprint.compositionNodeRef)) {
        context.addIssue({ code: 'custom', message: `Composition ${blueprint.compositionNodeRef} has more than one blueprint.`, path: [index, 'compositionNodeRef'] });
      }
      seenRefs.add(blueprint.compositionNodeRef);
    });
  });

export type CompositionBlueprint = z.infer<typeof blueprintSchema>;

function addDuplicateIssues(values: string[], context: z.RefinementCtx, pathPrefix: Array<string | number>, label: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) context.addIssue({ code: 'custom', message: `${label} must be unique.`, path: [...pathPrefix, index] });
    seen.add(value);
  });
}
