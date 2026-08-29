import {
  COMPOSITION_TEXT_FONT_SIZE_MAX,
  COMPOSITION_TEXT_FONT_SIZE_MIN,
  COMPOSITION_TEXT_LINE_HEIGHT_MAX,
  COMPOSITION_TEXT_LINE_HEIGHT_MIN,
} from '@/entities/production-graph/model/composition-text-constraints';

const blendModes = [
  'pass-through', 'normal', 'darken', 'multiply', 'plus-darker', 'color-burn',
  'lighten', 'screen', 'plus-lighter', 'color-dodge', 'overlay', 'soft-light',
  'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
] as const;

const normalizedFrameSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
    width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
    height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
  },
} as const;

const compositionLayerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'name', 'role', 'kind', 'source', 'frame', 'zIndex'],
  properties: {
    key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$', minLength: 1, maxLength: 48 },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    role: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$', minLength: 1, maxLength: 48 },
    kind: { type: 'string', enum: ['text', 'image'] },
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['nodeRef', 'portId'],
      properties: {
        nodeRef: { type: 'string', minLength: 1, maxLength: 120 },
        portId: { type: 'string', minLength: 1, maxLength: 80 },
      },
    },
    frame: normalizedFrameSchema,
    zIndex: { type: 'integer', minimum: -1_000, maximum: 1_000 },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
    opacity: { type: 'number', minimum: 0, maximum: 100 },
    visible: { type: 'boolean' },
    locked: { type: 'boolean' },
    blendMode: { type: 'string', enum: blendModes },
    image: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fit: { type: 'string', enum: ['fit', 'fill', 'stretch'] },
        preserveAspectRatio: { type: 'boolean' },
        flipX: { type: 'boolean' },
        flipY: { type: 'boolean' },
      },
    },
    text: {
      type: 'object',
      additionalProperties: false,
      properties: {
        align: { type: 'string', enum: ['left', 'center', 'right'] },
        verticalAlign: { type: 'string', enum: ['top', 'center', 'bottom'] },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        gradient: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'angle', 'stops'],
          properties: {
            type: { type: 'string', enum: ['linear'] },
            angle: { type: 'number', minimum: -360, maximum: 360 },
            stops: {
              type: 'array',
              minItems: 2,
              maxItems: 8,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['color', 'offset'],
                properties: {
                  color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
                  offset: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
        fontFamily: { type: 'string', minLength: 1, maxLength: 160 },
        fontSize: {
          type: 'number',
          minimum: COMPOSITION_TEXT_FONT_SIZE_MIN,
          maximum: COMPOSITION_TEXT_FONT_SIZE_MAX,
        },
        fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800'] },
        letterSpacing: { type: 'number', minimum: -100, maximum: 500 },
        lineHeight: {
          type: 'number',
          minimum: COMPOSITION_TEXT_LINE_HEIGHT_MIN,
          maximum: COMPOSITION_TEXT_LINE_HEIGHT_MAX,
        },
        sizingMode: { type: 'string', enum: ['auto-width', 'auto-height', 'fixed'] },
      },
    },
  },
} as const;

export const compositionBlueprintsJsonSchema: Record<string, unknown> = {
  type: 'array',
  maxItems: 24,
  description: [
    'Optional high-level Composition contracts. Each blueprint configures one composition node,',
    'creates its layer input edges automatically and uses normalized 0..1 layer frames.',
    'QR is an image layer with role "qr" and a qrCode.image source.',
  ].join(' '),
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'compositionNodeRef', 'mode', 'canvas', 'layers'],
    properties: {
      version: { type: 'integer', enum: [1] },
      compositionNodeRef: { type: 'string', minLength: 1, maxLength: 120 },
      mode: { type: 'string', enum: ['replace', 'merge'] },
      canvas: {
        type: 'object',
        additionalProperties: false,
        required: ['width', 'height'],
        properties: {
          width: { type: 'integer', minimum: 256, maximum: 4096 },
          height: { type: 'integer', minimum: 256, maximum: 4096 },
        },
      },
      layers: {
        type: 'array',
        minItems: 1,
        maxItems: 24,
        items: compositionLayerSchema,
      },
      groups: {
        type: 'array',
        maxItems: 24,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'name', 'layerKeys'],
          properties: {
            key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$', minLength: 1, maxLength: 48 },
            name: { type: 'string', minLength: 1, maxLength: 120 },
            layerKeys: {
              type: 'array',
              minItems: 1,
              maxItems: 24,
              uniqueItems: true,
              items: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]*$', minLength: 1, maxLength: 48 },
            },
            visible: { type: 'boolean' },
            locked: { type: 'boolean' },
            collapsed: { type: 'boolean' },
          },
        },
      },
    },
  },
};
