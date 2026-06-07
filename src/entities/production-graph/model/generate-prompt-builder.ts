import { productionLayers } from './production-layers';
import type { ProductionLayerId } from './production-layers';
import type { ProductionNodeType } from './types';

export type GenerateReferenceSlot = 'reference' | ProductionLayerId;
export type GenerateLayerInputs = Record<ProductionLayerId, string[]>;

export interface GenerateReferenceImage {
  dataUrl: string;
  sourceAssetId?: string;
  sourceNodeTypes?: ProductionNodeType[];
  slots: GenerateReferenceSlot[];
}

interface ComposeGenerationPromptParams {
  aspectRatio: string;
  inputs: GenerateLayerInputs;
  prompt: string;
  referenceImages: Array<Omit<GenerateReferenceImage, 'dataUrl'>>;
  size: string;
  locationInputs?: string[];
  subjectInputs?: string[];
}

export function composeGenerationPrompt({
  aspectRatio,
  inputs,
  locationInputs = [],
  prompt,
  referenceImages,
  size,
  subjectInputs = [],
}: ComposeGenerationPromptParams) {
  const layerBlocks = productionLayers
    .map((layer) => formatLayerBlock(layer.id, layer.label, inputs[layer.id]))
    .filter(Boolean);
  const subjectBlock = formatSubjectBlock(subjectInputs);
  const locationBlock = formatLocationBlock(locationInputs);
  const defaultTaskBlock = formatDefaultTaskBlock({
    hasExplicitTextTask: Boolean(prompt.trim()) || layerBlocks.length > 0,
    hasLocationReferences: locationInputs.length > 0 || referenceImages.some((reference) => (
      reference.slots.includes('background')
      && reference.sourceNodeTypes?.includes('locationBuilder')
    )),
    hasReferenceImages: referenceImages.length > 0,
    hasSubjectReferences: subjectInputs.length > 0 || referenceImages.some((reference) => (
      reference.slots.includes('actors')
      && reference.sourceNodeTypes?.includes('subjectBuilder')
    )),
  });

  return [
    'You are an AI image production generator. Build one production-ready image from a layered creative brief.',
    `Output contract: aspect ratio ${aspectRatio}, image size ${size}.`,
    'Return exactly one generated image payload. Do not return only text, analysis, instructions, or a prompt rewrite.',
    'Priority: main user prompt first; connected layer text and layer image references override the same layer from the Main Reference; layer references guide only the slots they are connected to.',
    'Never blend a Layer Reference image as a second scene. Treat every Layer Reference as a sampling source for selected visual properties, not as content, layout, object, or composition to merge.',
    defaultTaskBlock,
    prompt.trim() ? `[MAIN USER PROMPT]\n${prompt.trim()}` : '',
    subjectBlock,
    locationBlock,
    layerBlocks.length ? `[CONNECTED LAYER INSTRUCTIONS]\n${layerBlocks.join('\n\n')}` : '',
    referenceImages.length ? `[IMAGE REFERENCE ROUTING]\n${referenceImages.map(formatReferenceSummary).join('\n\n')}` : '',
    'If a Main Reference image is attached, treat it as the base source image: preserve visible properties that are not explicitly changed by the main prompt, connected layer text, or connected layer image references.',
    'Global constraints: no random watermark, no unintended logo, no fake readable text, no malformed anatomy, no broken objects, no messy layout, no low-resolution artifacts.',
  ].filter(Boolean).join('\n\n');
}

export function composeReferenceImageInstruction(reference: Omit<GenerateReferenceImage, 'sourceAssetId'>, index: number) {
  const slots = normalizeReferenceSlots(reference.slots);
  const hasMainReference = slots.includes('reference');
  const layerSlots = slots.filter((slot): slot is ProductionLayerId => slot !== 'reference');
  const layerList = layerSlots.length ? layerSlots.map(getSlotLabel).join(', ') : 'no explicit layer slots';
  const hasCompositionSketch = layerSlots.includes('composition') && reference.sourceNodeTypes?.includes('sketch');
  const hasSubjectBuilder = layerSlots.includes('actors') && reference.sourceNodeTypes?.includes('subjectBuilder');
  const hasLocationBuilder = layerSlots.includes('background') && reference.sourceNodeTypes?.includes('locationBuilder');

  if (hasMainReference) {
    return [
      `[REFERENCE IMAGE ${index}: MAIN REFERENCE]`,
      'Use this attached image as the base visual source for the generation.',
      'Preserve the visible scene, subject, composition, camera, lighting, style, background, color and text behavior unless the main prompt, connected layer text, or connected layer image references explicitly override them.',
      layerSlots.length ? `Explicit connected layer overrides on this same image: ${layerList}.` : '',
      'Do not treat this as a pixel-perfect copy request; generate a new image guided by the source.',
    ].filter(Boolean).join('\n');
  }

  return [
    `[REFERENCE IMAGE ${index}: LAYER REFERENCE]`,
    `Allowed source layers: ${layerList}.`,
    hasSubjectBuilder ? 'This image came from a Subject Builder. Use it only to preserve subject identity, recognizable anatomy, proportions, face, silhouette, product shape, material marks, and stable subject traits.' : '',
    hasLocationBuilder ? 'This image came from a Location Builder. Use it only to preserve environment identity, spatial layout, architecture, surfaces, scale cues, atmosphere, and stable location traits.' : '',
    hasCompositionSketch ? COMPOSITION_SKETCH_CONTROL : `Extract and transfer only these visual properties from this image: ${getAllowedLayerProperties(layerSlots)}.`,
    'This is not a scene reference, not a base image, and not a request to blend or merge visual content.',
    'Do not transfer objects, silhouettes, UI elements, geometry, layout, composition, camera angle, background structure, text, logos, narrative, or subject identity from this image unless those exact layers are listed above.',
    'Keep the Main Reference, main prompt, or explicit default generation task as the source of scene structure and content.',
  ].join('\n');
}

export function normalizeReferenceSlots(slots: GenerateReferenceSlot[]) {
  const allowed = new Set<GenerateReferenceSlot>(['reference', ...productionLayers.map((layer) => layer.id)]);
  return Array.from(new Set(slots.filter((slot) => allowed.has(slot))));
}

function formatLayerBlock(layerId: ProductionLayerId, label: string, values: string[]) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  if (cleanValues.length === 0) return '';
  return `[${label.toUpperCase()}]\n${cleanValues.map((value) => `- ${value}`).join('\n')}`;
}

function formatSubjectBlock(values: string[]) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  if (cleanValues.length === 0) return '';
  return [
    '[CONNECTED SUBJECT PASSPORTS]',
    'Use these subject passports as identity-control instructions. Preserve immutable traits and recognizable identity. Scene, pose, lighting, outfit, background and style may adapt only where the passport or main prompt allows it.',
    cleanValues.map((value, index) => `[SUBJECT ${index + 1}]\n${value}`).join('\n\n'),
  ].join('\n\n');
}

function formatLocationBlock(values: string[]) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  if (cleanValues.length === 0) return '';
  return [
    '[CONNECTED LOCATION PASSPORTS]',
    'Use these location passports as environment-control instructions. Preserve stable spatial identity, architecture, surfaces, environmental cues, scale, and atmosphere. Camera, lighting, dressing, weather, action, and subject placement may adapt only where the passport or main prompt allows it.',
    cleanValues.map((value, index) => `[LOCATION ${index + 1}]\n${value}`).join('\n\n'),
  ].join('\n\n');
}

function formatDefaultTaskBlock({
  hasExplicitTextTask,
  hasLocationReferences,
  hasReferenceImages,
  hasSubjectReferences,
}: {
  hasExplicitTextTask: boolean;
  hasLocationReferences: boolean;
  hasReferenceImages: boolean;
  hasSubjectReferences: boolean;
}) {
  if (hasExplicitTextTask) return '';
  if (hasSubjectReferences) {
    return [
      '[DEFAULT GENERATION TASK]',
      'No main scene prompt is connected. Generate a single neutral production-ready identity shot for the connected subject.',
      'Use a clean studio/editorial composition, centered readable subject, simple non-distracting background, no text, no logo, no watermark, no collage.',
      'Preserve recognizable subject identity from the subject passport and subject reference images. Do not invent a different person, product, animal, object, or character.',
    ].join('\n');
  }
  if (hasLocationReferences) {
    return [
      '[DEFAULT GENERATION TASK]',
      'No main scene prompt is connected. Generate a single neutral production-ready establishing image for the connected location.',
      'Use a clean editorial composition, readable environment geometry, coherent scale, no text, no logo, no watermark, no collage.',
      'Preserve recognizable location identity from the location passport and location reference images. Do not invent a different place, environment type, architecture, or spatial layout.',
    ].join('\n');
  }
  if (hasReferenceImages) {
    return [
      '[DEFAULT GENERATION TASK]',
      'No main scene prompt is connected. Generate one production-ready image guided by the attached references and their allowed routing slots.',
      'Use a clean, coherent composition with no text, no logo, no watermark, and no collage unless explicitly requested.',
    ].join('\n');
  }
  return '';
}

function formatReferenceSummary(reference: Omit<GenerateReferenceImage, 'dataUrl'>, index: number) {
  const slots = normalizeReferenceSlots(reference.slots);
  const role = slots.includes('reference') ? 'Main Reference' : 'Layer Reference';
  const explicitLayers = slots.filter((slot) => slot !== 'reference').map(getSlotLabel);
  return `Reference Image ${index + 1}: ${role}. Connected layers: ${explicitLayers.join(', ') || 'base image'}.`;
}

function getSlotLabel(slot: GenerateReferenceSlot) {
  if (slot === 'reference') return 'Main Reference';
  return productionLayers.find((layer) => layer.id === slot)?.label ?? slot;
}

function getAllowedLayerProperties(slots: ProductionLayerId[]) {
  if (slots.length === 0) return 'no visual properties unless explicitly requested elsewhere';
  return slots.map((slot) => layerPropertyHints[slot] ?? getSlotLabel(slot)).join('; ');
}

const layerPropertyHints: Record<ProductionLayerId, string> = {
  actors: 'subject identity, visible traits, character or product appearance',
  actions: 'pose, action, movement, interaction and object state',
  composition: 'framing, placement, hierarchy, negative space and spatial rhythm',
  camera: 'viewpoint, angle, lens feel, perspective, focus and depth of field',
  background: 'environment type, surface, atmosphere and surrounding context',
  style: 'rendering technique, realism level, material language and production look',
  light: 'light direction, softness, contrast, shadows, highlights and glow behavior',
  color: 'palette, tonal range, saturation, contrast, color temperature, tinted shadows, colored highlights and grade',
  metaphor: 'visual idea, symbolic meaning, communication promise and narrative intent',
  text: 'exact readable text, typography, callouts, labels and text placement',
};

const COMPOSITION_SKETCH_CONTROL = `[COMPOSITION SKETCH CONTROL]

Use the attached sketch ONLY as a composition, placement and depth-control map.

The sketch is not a drawing style, not line art, not a silhouette design, not clothing, not anatomy, not object shape, not lighting, not color, not background, and not a subject reference. Do not render the black sketch lines in the final image.

Interpret the black strokes as rough bounding masses / placement slots for the main subjects or objects in the final scene.

Follow these rules strictly:

1. Each separate sketched mass represents one main subject/object placement slot.
2. Preserve the number of main masses unless the main text prompt explicitly says otherwise.
3. Preserve the relative horizontal positions of the masses: left, center, right.
4. Preserve the relative vertical positions: top, middle, bottom.
5. Preserve the relative size hierarchy: larger masses should feel closer or more dominant; smaller masses should feel farther away or less dominant.
6. Preserve the depth order implied by overlap, scale and staggered placement.
7. If the sketch shows objects overlapping or arranged in a stepped diagonal sequence, interpret this as depth layering, not as a flat side-by-side row.
8. The nearest object should partially occlude or visually overlap the objects behind it.
9. Do not reverse the front-to-back order.
10. Do not spread the subjects evenly across the frame if the sketch shows them clustered or overlapping.
11. Do not convert the sketch into mountains, arches, abstract shapes, shadows, hair outlines or decorative lines.
12. Use the user's text prompt to decide WHAT the subjects are. Use the sketch only to decide WHERE they are placed and how they relate in depth.
13. If the target aspect ratio differs from the sketch aspect ratio, adapt the sketch proportionally to the target frame while preserving the relative placement, scale hierarchy, overlap and depth order. Add empty space only around the composition, not between the sketched masses.

Generate the final image according to the main prompt, using this sketch only as the composition and depth guide.`;
