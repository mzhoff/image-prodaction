import { z } from 'zod';
import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import { storySnapshotSchema } from '@/modules/story-projects/contracts/story-project';
import { storyCharacterDraftSchema } from '@/modules/story-projects/contracts/story-character';

export const STORY_QUESTION_TOOL = 'story_ask_question';
export const STORY_SCENES_TOOL = 'story_create_scenes';
export const STORY_BLUEPRINT_TOOL = 'story_save_blueprint';
export const STORY_CHARACTERS_TOOL = 'story_save_characters';
export const STORY_WRITING_TOOLS = [STORY_BLUEPRINT_TOOL, STORY_SCENES_TOOL, STORY_CHARACTERS_TOOL];
export const STORY_BLUEPRINT_PRESENTATION = 'image-production.story-blueprint';
export const storyQuestionSchema = z.object({
  question: z.string().trim().min(5).max(600),
  options: z.array(z.object({ label: z.string().trim().min(1).max(100), description: z.string().trim().max(240) }).strict()).length(2),
}).strict();
export const storyQuestionResultSchema = storyQuestionSchema.extend({
  action: z.literal('story-question'), interactionId: z.string().min(1),
});
export type StoryQuestion = z.infer<typeof storyQuestionResultSchema>;
export const storyCharactersInputSchema = z.object({
  expectedRevision: z.number().int().min(0), characters: z.array(storyCharacterDraftSchema).min(1).max(6),
}).strict().refine((input) => { const ids = input.characters.map((item) => item.id).filter(Boolean); return new Set(ids).size === ids.length; }, 'Не изменяйте одного героя дважды в одном вызове.');
export const storyBlueprintInputSchema = z.object({
  expectedRevision: z.number().int().min(0),
  blueprint: storySnapshotSchema.shape.blueprint,
}).strict().refine((value) => value.blueprint.purpose.trim() && value.blueprint.audience.trim() && value.blueprint.script.trim(), 'Заполните замысел, аудиторию и сценарий.');
export const storyScenesInputSchema = z.object({
  expectedRevision: z.number().int().min(0),
  scenes: z.array(z.object({
    title: z.string().trim().min(1).max(120), description: z.string().trim().max(4000),
    shots: z.array(z.object({ description: z.string().trim().min(1).max(2000), durationMs: z.number().int().min(100).max(600_000) }).strict()).min(1).max(8),
  }).strict()).min(1).max(12),
}).strict();
export const storyAuthoringTools: AgentToolDefinition[] = [{
  name: STORY_CHARACTERS_TOOL, riskLevel: 'write',
  description: 'Create or update structured character passports in the current story. Only after the user asks to prepare or change characters. id=null creates a character; an existing id updates that exact character. Preserve locked traits unless the user explicitly asks to change them. Use current story revision. No media generation or changes to shared Library. The same passport powers manual controls, readable text and image prompts. Populate choices and a few short meaningful traits; do not put all attributes into identity/details prose.',
  inputSchema: z.toJSONSchema(z.object({ expectedRevision: z.number().int().min(0), characters: z.array(storyCharacterDraftSchema).min(1).max(6) }).strict()),
}, {
  name: STORY_QUESTION_TOOL, riskLevel: 'read',
  description: 'Ask one useful story question through an interactive card with exactly two distinct options. The user can also write their own answer. After calling, wait for their answer; do not save a blueprint in the same turn or repeat the question in prose.',
  inputSchema: z.toJSONSchema(storyQuestionSchema),
}, {
  name: STORY_BLUEPRINT_TOOL, riskLevel: 'write',
  description: 'Save the complete story blueprint once the brief is clear. Use the saved revision from context. Only changes purpose, audience, script and visualStyle of the current story; preserves scenes, characters and settings. Never claim it is saved before the tool succeeds.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['expectedRevision', 'blueprint'], properties: {
    expectedRevision: { type: 'integer', minimum: 0 }, blueprint: z.toJSONSchema(storySnapshotSchema.shape.blueprint),
  } },
}, {
  name: STORY_SCENES_TOOL, riskLevel: 'write',
  description: 'Create the first storyboard from the saved blueprint ONLY when the user explicitly asks for a storyboard or scenes. Use the current revision. A maximum of 12 scenes and 8 shots per scene. Describe action and framing; distribute durations to the target story duration. This does not generate media. Existing scenes cannot be replaced by this tool.',
  inputSchema: z.toJSONSchema(storyScenesInputSchema),
}];
