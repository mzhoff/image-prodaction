import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { SubjectPreserveStrength, SubjectType } from '@/entities/production-graph/model/types';
import { AiRequestError } from '../api/ai-client';

export const subjectTypeOptions: Array<{ value: SubjectType; label: string }> = [
  { value: 'person', label: 'Person' },
  { value: 'character', label: 'Character' },
  { value: 'product', label: 'Product' },
  { value: 'object', label: 'Object' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'animal', label: 'Animal' },
  { value: 'place', label: 'Place' },
];

export const subjectPreserveStrengthOptions: Array<{ value: SubjectPreserveStrength; label: string }> = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'flexible', label: 'Flexible' },
];

export const SUBJECT_PROFILE_REFERENCE_SLOTS: Array<{ id: string; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'three-quarter', label: '3/4' },
  { id: 'profile', label: 'Profile' },
  { id: 'full-body', label: 'Full body' },
];

export function shouldDiscardGenerationRequest(error: unknown) {
  return error instanceof AiRequestError && error.code !== 'generation_in_progress' && error.status < 500;
}

export function cleanDraftValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function getSubjectReferenceSlotLabel(slotId: string) {
  return SUBJECT_PROFILE_REFERENCE_SLOTS.find((slot) => slot.id === slotId)?.label ?? 'Subject';
}

export function createEmptyGenerateInputs() {
  return productionLayers.reduce((inputs, layer) => {
    inputs[layer.id] = [];
    return inputs;
  }, {} as Record<string, string[]>);
}

export function buildSubjectReferencePrompt({
  slotId,
  slotLabel,
  subjectPassport,
  subjectType,
  textNotes,
}: {
  slotId: string;
  slotLabel: string;
  subjectPassport: string;
  subjectType: SubjectType;
  textNotes: string[];
}) {
  return [
    `Generate canonical library reference image: ${slotLabel}.`,
    getSubjectTypeProfileInstruction(subjectType),
    getSlotPoseInstruction(subjectType, slotId),
    subjectPassport ? `[SUBJECT PASSPORT]\n${subjectPassport}` : '',
    textNotes.length ? `[CONNECTED TEXT NOTES]\n${textNotes.join('\n\n')}` : '',
    'Use the attached image refs only to preserve stable identity, proportions, permanent design traits, body/silhouette, material identity, and recognizable markers.',
    'Neutral light gray studio background, soft even light, clean production reference look, single centered subject, no text, no logo, no watermark, no collage, no dramatic scene context.',
  ].filter(Boolean).join('\n\n');
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getSubjectTypeProfileInstruction(subjectType: SubjectType) {
  if (subjectType === 'person' || subjectType === 'character') {
    return [
      'Subject type: human/person or character.',
      'Create a clean casting/profile reference, not a fashion editorial scene.',
      'Wardrobe must be neutral, non-branded, non-distracting, modest, form-readable and safe: simple fitted base layer or plain fitted top and simple pants.',
      'Do not generate nudity, underwear-only styling, sexualized pose, costume noise, heavy accessories, branding, logos, dramatic makeup, or temporary outfit details from source refs unless they are permanent identity markers.',
      'Preserve face identity, head shape, hair, stable facial proportions, body build, posture tendencies, and permanent distinctive marks.',
      'For portrait slots, prioritize likeness and facial detail over clothing or scene; the head and face must be large enough to inspect.',
    ].join(' ');
  }
  if (subjectType === 'product' || subjectType === 'object') {
    return [
      'Subject type: product/object.',
      'Create a clean object library reference on a neutral studio surface or invisible support.',
      'Preserve exact form language, proportions, material, surface finish, functional details, edges, seams, design marks, and scale cues.',
      'Do not add packaging, branding, UI text, hands, environment, extra props, or lifestyle context unless they are permanent parts of the object.',
    ].join(' ');
  }
  if (subjectType === 'vehicle') {
    return [
      'Subject type: vehicle/technical object.',
      'Create a clean catalog reference of one vehicle or machine on a neutral light gray studio background.',
      'Preserve body shape, wheelbase, silhouette, panel geometry, material finish, lights, windows, scale, and permanent technical details.',
      'Do not add road scenes, drivers, motion blur, cinematic lighting, license text, branding, or environment.',
    ].join(' ');
  }
  if (subjectType === 'animal') {
    return [
      'Subject type: animal.',
      'Create a clean biological profile reference on a neutral studio background.',
      'Preserve species, body proportions, coat/skin texture, markings, head shape, posture, and recognizable anatomy.',
      'Do not add costumes, props, humans, habitat, fantasy features, or action scene context.',
    ].join(' ');
  }
  return [
    'Subject type: place/environment-like subject.',
    'Create a clean reusable identity reference with neutral presentation.',
    'Preserve stable form, spatial cues, material identity, geometry, and recognizable permanent details.',
    'Do not add narrative action, people, branding, random text, or unrelated props.',
  ].join(' ');
}

function getSlotPoseInstruction(subjectType: SubjectType, slotId: string) {
  if (subjectType === 'person' || subjectType === 'character') {
    if (slotId === 'front') return 'View: front-facing close neck-and-shoulders portrait, symmetrical readable face/head, upper shoulders only, face large in frame for maximum likeness detail.';
    if (slotId === 'three-quarter') return 'View: three-quarter close shoulder portrait, readable face/head volume and facial structure, upper torso cropped, face large in frame.';
    if (slotId === 'profile') return 'View: strict side profile close neck-and-shoulders portrait, clean readable side silhouette, face/head large in frame for maximum identity detail.';
    return 'View: full-body standing reference, complete figure visible head-to-toe with readable body proportions and neutral stance.';
  }
  if (subjectType === 'animal') {
    if (slotId === 'front') return 'View: front-facing close head-and-shoulders biological reference, head large in frame with readable markings.';
    if (slotId === 'three-quarter') return 'View: three-quarter close biological profile reference, readable head volume, markings, and anatomy.';
    if (slotId === 'profile') return 'View: strict side profile close biological reference, clean readable side silhouette and markings.';
    return 'View: full-body standing biological reference, complete animal visible head-to-tail with readable body proportions and neutral stance.';
  }
  if (subjectType === 'vehicle') {
    if (slotId === 'front') return 'View: front view, centered, full vehicle visible.';
    if (slotId === 'three-quarter') return 'View: three-quarter front view, full vehicle visible.';
    if (slotId === 'profile') return 'View: strict side profile, full vehicle silhouette visible.';
    return 'View: full catalog view with complete vehicle/machine visible and scale readable.';
  }
  if (slotId === 'front') return 'View: front orthographic-like product reference.';
  if (slotId === 'three-quarter') return 'View: three-quarter product reference showing volume and depth.';
  if (slotId === 'profile') return 'View: side profile reference showing silhouette and thickness.';
  return 'View: full object reference with complete form visible and scale readable.';
}
