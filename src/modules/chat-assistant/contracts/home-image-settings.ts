import { z } from 'zod';
import { isUuidV7 } from '@/shared/lib/id';

export const HOME_IMAGE_SETTINGS_ENTITY = 'home-image-settings';
export const homeImageSettingsSchema = z.object({
  model: z.string().trim().min(1).max(255),
  aspectRatio: z.string().trim().min(1).max(20),
  size: z.string().trim().min(1).max(20),
  subjectIds: z.array(z.string().refine(isUuidV7)).max(3).default([]),
  submitAuthorized: z.literal(true).optional(),
}).strict();
export const homeImageSettingsRequestSchema = homeImageSettingsSchema.extend({
  conversationId: z.string().trim().min(1).max(160),
  uploadedReferenceCount: z.number().int().min(0).max(3).default(0),
});
export type HomeImageSettings = z.infer<typeof homeImageSettingsSchema>;
export interface HomeSubjectSnapshot {
  id: string;
  name: string;
  revision: number;
  passportText: string;
  reference?: { assetId: string; checksumSha256: string; contentType: string };
}
export interface PinnedHomeImageSettings {
  id: string;
  settings: HomeImageSettings;
  subjects: HomeSubjectSnapshot[];
}

export const homeSubjectPreviewSchema = z.object({
  id: z.string().refine(isUuidV7), name: z.string(), assetId: z.string().refine(isUuidV7).optional(),
});
export type HomeSubjectPreview = z.infer<typeof homeSubjectPreviewSchema>;
export const homeImagePreviewsSchema = z.record(z.string(), z.array(homeSubjectPreviewSchema));

/** Only the name and primary image belong in the message preview, never the private passport. */
export function homeSubjectPreviews(subjects: HomeSubjectSnapshot[]): HomeSubjectPreview[] {
  return subjects.map(({ id, name, reference }) => ({ id, name, ...(reference ? { assetId: reference.assetId } : {}) }));
}

export function homeImageSettingsSelector(settingsId: string) {
  return { route: '/', entity: { type: HOME_IMAGE_SETTINGS_ENTITY, id: settingsId } };
}
