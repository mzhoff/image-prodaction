import { productionLayers } from './production-layers';
import type { ProductionLayerId } from './production-layers';

export type GenerateReferenceSlot = 'reference' | ProductionLayerId;
export type GenerateLayerInputs = Record<ProductionLayerId, string[]>;

export interface GenerateReferenceImage {
  dataUrl: string;
  sourceAssetId?: string;
  slots: GenerateReferenceSlot[];
}

interface ComposeGenerationPromptParams {
  aspectRatio: string;
  inputs: GenerateLayerInputs;
  prompt: string;
  referenceImages: Array<Omit<GenerateReferenceImage, 'dataUrl'>>;
  size: string;
}

export function composeGenerationPrompt({
  aspectRatio,
  inputs,
  prompt,
  referenceImages,
  size,
}: ComposeGenerationPromptParams) {
  const layerBlocks = productionLayers
    .map((layer) => formatLayerBlock(layer.id, layer.label, inputs[layer.id]))
    .filter(Boolean);

  return [
    'You are an AI image production generator. Build one production-ready image from a layered creative brief.',
    `Output contract: aspect ratio ${aspectRatio}, image size ${size}.`,
    'Priority: main user prompt first; connected layer text and layer image references override the same layer from the Main Reference; layer references guide only the slots they are connected to.',
    'Never blend a Layer Reference image as a second scene. Treat every Layer Reference as a sampling source for selected visual properties, not as content, layout, object, or composition to merge.',
    prompt.trim() ? `[MAIN USER PROMPT]\n${prompt.trim()}` : '',
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
    `Extract and transfer only these visual properties from this image: ${getAllowedLayerProperties(layerSlots)}.`,
    'This is not a scene reference, not a base image, and not a request to blend or merge visual content.',
    'Do not transfer objects, silhouettes, UI elements, geometry, layout, composition, camera angle, background structure, text, logos, narrative, or subject identity from this image unless those exact layers are listed above.',
    'Keep the Main Reference and main prompt as the source of scene structure and content.',
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
