import { z } from 'zod';

export const HOME_TEXT_SETTINGS_ENTITY = 'home-text-settings';
export const homeTextSettingsSchema = z.object({
  model: z.string().trim().min(1).max(255),
  temperature: z.number().min(0).max(2).optional(),
  reasoning: z.enum(['low', 'medium', 'high']).optional(),
  outputStyle: z.enum(['plain', 'markdown', 'numbered-list']).default('markdown'),
}).strict();
export type HomeTextSettings = z.infer<typeof homeTextSettingsSchema>;
export const homeTextSettingsRequestSchema = homeTextSettingsSchema.extend({ conversationId: z.string().min(1).max(160) });
export function homeTextSettingsSelector(id: string) { return { route: '/', entity: { type: HOME_TEXT_SETTINGS_ENTITY, id } }; }
