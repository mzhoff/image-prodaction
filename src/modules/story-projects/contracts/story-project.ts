import { z } from 'zod';
import { storyCharacterSchema } from './story-character';

export const storyFormatSchema = z.enum(['free', 'short-film', 'advert', 'promo', 'youtube', 'shorts', 'expert']);
export const storyGenreSchema = z.enum(['free', 'comedy', 'tragedy', 'horror', 'thriller', 'documentary']);
const id = z.uuid();
const prose = z.string().max(20_000);
export const storySettingsSchema = z.object({
  format: storyFormatSchema, genre: storyGenreSchema, presetVersion: z.literal(1),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']),
  targetDurationSeconds: z.number().int().min(5).max(7200),
  language: z.string().trim().min(1).max(40),
}).strict();
export const storyShotSchema = z.object({
  id, description: prose, durationMs: z.number().int().min(100).max(600_000),
  imageAssetId: id.nullable(), videoAssetId: id.nullable(),
}).strict();
export const storySceneSchema = z.object({
  id, title: z.string().trim().min(1).max(120), description: prose,
  shots: z.array(storyShotSchema).max(100),
}).strict();
export const storyClipSchema = z.object({
  id, shotId: id.nullable(), assetId: id, kind: z.enum(['image', 'video']),
  sourceInMs: z.number().int().min(0).max(7_200_000),
  durationMs: z.number().int().min(100).max(600_000),
}).strict().refine((clip) => clip.kind !== 'image' || clip.sourceInMs === 0, 'Изображение не имеет точки входа.');
export const storySnapshotSchema = z.object({
  schemaVersion: z.literal(2), settings: storySettingsSchema,
  subjectIds: z.array(id).max(3).refine((ids) => new Set(ids).size === ids.length, 'Герои не должны повторяться.').optional(),
  characters: z.array(storyCharacterSchema).max(12).optional(),
  charactersSkipped: z.boolean().optional(),
  blueprint: z.object({ purpose: prose, audience: prose, script: prose, visualStyle: prose }).strict(),
  scenes: z.array(storySceneSchema).max(100),
}).strict().superRefine((story, ctx) => {
  const shots = story.scenes.flatMap((scene) => scene.shots);
  if (new Set(story.characters?.map((character) => character.id)).size !== (story.characters?.length ?? 0)) ctx.addIssue({ code: 'custom', message: 'Герои не должны повторяться.' });
  const ids = [...story.scenes.map((scene) => scene.id), ...shots.map((shot) => shot.id)];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Идентификаторы сцен, кадров и клипов должны быть уникальны.' });
  if (shots.length > 500) ctx.addIssue({ code: 'custom', message: 'В истории не более 500 кадров.' });

});
export const storyWriteSchema = z.object({
  name: z.string().trim().min(1).max(120), folderId: id.nullable(), snapshot: storySnapshotSchema,
}).strict();
export const storySaveSchema = storyWriteSchema.extend({ expectedRevision: z.number().int().min(0) });
export type StorySettings = z.infer<typeof storySettingsSchema>;
export type StorySnapshot = z.infer<typeof storySnapshotSchema>;
export type StoryScene = z.infer<typeof storySceneSchema>;
export type StoryShot = z.infer<typeof storyShotSchema>;
export type StoryClip = z.infer<typeof storyClipSchema>;
export type StoryWrite = z.infer<typeof storyWriteSchema>;
export interface StorySummary {
  id: string; workspaceId: string; folderId: string | null; name: string;
  revision: number; createdAt: string; updatedAt: string;
}
export interface StoryProject extends StorySummary { snapshot: StorySnapshot }
export interface StoryMedia {
  id: string; originalName: string; mediaKind: 'image' | 'video';
  contentUrl?: string; thumbnailUrl?: string; video?: { durationSeconds: number; browserPlayable: boolean };
}
