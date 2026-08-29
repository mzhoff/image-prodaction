import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';

export const DESIGN_ELEMENT_SELECTION_TOOL = 'design_element_selection';
export const DESIGN_ELEMENT_SELECTION_PRESENTATION = 'image-production.design-element-selection';

export const DESIGN_ELEMENT_KINDS = ['text', 'image'] as const;
export type DesignElementKind = (typeof DESIGN_ELEMENT_KINDS)[number];

export const DESIGN_ELEMENT_ROLES = [
  'brandline',
  'headline',
  'subheadline',
  'body',
  'offer',
  'date',
  'time',
  'place',
  'cta',
  'caption',
  'legal',
  'qr',
  'qr-caption',
  'background',
  'hero',
  'product',
  'logo',
  'supporting-image',
  'foreground',
  'decoration',
  'badge',
  'button',
  'other',
] as const;
export type DesignElementRole = (typeof DESIGN_ELEMENT_ROLES)[number];

export type BaseImageStrategy = 'single-image' | 'layered';
export type TextStrategy = 'embedded' | 'separate';

export interface NormalizedDesignElementFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface DetectedDesignElement {
  confidence?: number;
  id: string;
  kind: DesignElementKind;
  label: string;
  observedContent?: string;
  referenceFrame?: NormalizedDesignElementFrame;
  role: DesignElementRole;
}

export interface DesignElementSelectionResult {
  action: 'select-design-elements';
  baseImageStrategy: BaseImageStrategy;
  elements: DetectedDesignElement[];
  interactionId: string;
  intentSummary: string;
  nextStep: string;
  recommendedElementIds: string[];
  recommendationReason: string;
  summary: string;
  textStrategy: TextStrategy;
  version: 1;
}

export interface DesignElementSelectionPayload {
  baseImageStrategy: BaseImageStrategy;
  customElements: string[];
  interactionId: string;
  kind: 'design-element-selection';
  selectedElementIds: string[];
  selectedElements: DetectedDesignElement[];
  textStrategy: TextStrategy;
  version: 1;
}

export const designElementSelectionTool: AgentToolDefinition = {
  name: DESIGN_ELEMENT_SELECTION_TOOL,
  description: [
    'Present an interactive product-owned choice when a user wants to recreate a visual reference as a repeatable editable canvas pipeline.',
    'Analyze the attached reference first and pass the concrete visible design elements, using stable semantic ids and roles. Include an approximate normalized referenceFrame whenever the element bounds are visible.',
    'Call this tool only after the user intent is known. If it is not known, ask one simple human question first: whether they want to change only text and QR, or also separate visual parts such as the background and hero.',
    'Omit baseImageStrategy and textStrategy unless the user explicitly requested a more editable approach. Product defaults intentionally keep the first draft simple: one combined generated image for hero/background/decor, text embedded in that image, and a functional QR as a separate image.',
    'After this read tool completes, wait for the structured user selection rendered by the product. Do not prepare pipeline_build or pipeline_update until that follow-up selection arrives.',
  ].join(' '),
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['intentSummary', 'elements'],
    properties: {
      intentSummary: {
        type: 'string',
        minLength: 4,
        maxLength: 320,
        description: 'Plain-language summary of what the user wants to reuse or control in future variants.',
      },
      baseImageStrategy: {
        type: 'string',
        enum: ['single-image', 'layered'],
        description: 'Pass layered only when the user explicitly wants visual objects to move, change, or regenerate separately.',
      },
      textStrategy: {
        type: 'string',
        enum: ['embedded', 'separate'],
        description: 'Pass separate only when the user explicitly wants editable text layers.',
      },
      elements: {
        type: 'array',
        minItems: 1,
        maxItems: 24,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'kind', 'role', 'label'],
          properties: {
            id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$', minLength: 2, maxLength: 64 },
            kind: {
              type: 'string',
              enum: DESIGN_ELEMENT_KINDS,
              description: 'Use image when role is qr. The product also normalizes this invariant defensively.',
            },
            role: { type: 'string', enum: DESIGN_ELEMENT_ROLES },
            label: { type: 'string', minLength: 1, maxLength: 100 },
            observedContent: { type: 'string', maxLength: 240 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            referenceFrame: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'width', 'height'],
              description: 'Approximate element bounds in the analyzed reference, normalized to the 0..1 canvas range.',
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 },
                y: { type: 'number', minimum: 0, maximum: 1 },
                width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
                height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },
  },
};
