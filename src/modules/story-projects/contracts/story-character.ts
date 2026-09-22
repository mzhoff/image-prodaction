import { z } from 'zod';

/** The UI and coauthor edit this object. Prompts are derived, never a second editable source. */
export const characterPassportSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  identity: z.string().trim().min(1).max(10_000),
  role: z.enum(['lead', 'companion', 'opponent', 'supporting']),
  kind: z.enum(['person', 'animal', 'fantasy', 'object']),
  temperament: z.array(z.enum(['kind', 'brave', 'curious', 'shy', 'cunning', 'playful', 'serious', 'calm'])).max(4),
  silhouette: z.enum(['story', 'round', 'slender', 'strong', 'small']),
  palette: z.enum(['story', 'warm', 'cool', 'natural', 'vivid', 'pastel']),
  rendering: z.enum(['story', '3d', 'illustration', 'realistic', 'stop-motion']),
  details: z.string().trim().max(10_000),
  traits: z.array(z.object({ label: z.string().trim().min(1).max(10_000), locked: z.boolean() }).strict()).max(12),
  constraints: z.string().trim().max(10_000),
  notes: z.string().trim().max(10_000).optional(),
}).strict();
export type CharacterPassport = z.infer<typeof characterPassportSchema>;
export const storyCharacterSchema = z.object({
  id: z.uuid(), revision: z.number().int().min(1), passport: characterPassportSchema,
  source: z.object({ subjectId: z.uuid(), revision: z.number().int().min(0) }).strict().optional(),
  references: z.array(z.uuid()).max(24),
  selectedReference: z.object({ assetId: z.uuid(), approvedRevision: z.number().int().min(1), visualStyle: z.string().max(20_000) }).strict().optional(),
  previousPassports: z.array(characterPassportSchema).max(5),
}).strict().superRefine((character, ctx) => {
  if (new Set(character.references).size !== character.references.length
    || (character.selectedReference && !character.references.includes(character.selectedReference.assetId))) {
    ctx.addIssue({ code: 'custom', message: 'Выбранный образ должен быть среди референсов героя.' });
  }
});
export type StoryCharacter = z.infer<typeof storyCharacterSchema>;
export const storyCharacterDraftSchema = z.object({ id: z.uuid().nullable(), passport: characterPassportSchema }).strict();
export const characterCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), expectedRevision: z.number().int().min(0), character: storyCharacterDraftSchema }).strict(),
  z.object({ action: z.literal('import'), expectedRevision: z.number().int().min(0), subjectId: z.uuid() }).strict(),
  z.object({ action: z.literal('reference'), expectedRevision: z.number().int().min(0), characterId: z.uuid(), assetId: z.uuid(), select: z.boolean() }).strict(),
  z.object({ action: z.literal('undo'), expectedRevision: z.number().int().min(0), characterId: z.uuid() }).strict(),
  z.object({ action: z.literal('skip'), expectedRevision: z.number().int().min(0), skipped: z.boolean() }).strict(),
]);
export type CharacterCommand = z.infer<typeof characterCommandSchema>;
export const characterGenerationSchema = z.object({
  characterId: z.uuid(), expectedRevision: z.number().int().min(0), attemptId: z.uuid(),
  model: z.string().trim().min(1).max(200),
}).strict();
export interface CharacterGeneration {
  id: string; characterId: string; characterRevision: number; visualStyle: string; model: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  assetId: string | null; error?: string; createdAt: string;
}
