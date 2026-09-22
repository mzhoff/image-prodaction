import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallRequest, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { callStoryTool, prepareStoryBlueprint } from './story-authoring-tools';
import { STORY_BLUEPRINT_TOOL, STORY_QUESTION_TOOL, STORY_CHARACTERS_TOOL, storyAuthoringTools } from '../contracts/story-authoring';
import { testPassport } from '@/modules/story-projects/core/character-test-fixture';
import { toolsForAssistantMode } from './home-tool-policy';

const blueprint = { purpose: 'Дружба сильнее страха', audience: 'Семейная аудитория', script: 'Бумажный кораблик отправляется через лужу к другу.', visualStyle: 'Бумага и мягкий свет' };
const context: ToolExecutionContext = { userId: 'author', tenantId: 'workspace', productId: 'image-production', conversationId: 'story:bound', toolCallId: 'call-1', verifiedContext: { storyAuthoringRevision: 0 } };
const request: ToolCallRequest = { toolName: STORY_BLUEPRINT_TOOL, riskLevel: 'write', input: { expectedRevision: 0, blueprint } };
function setup() {
  let current = { id: 'story-id', workspaceId: 'workspace', folderId: 'folder', name: 'Кораблик', revision: 0,
    createdAt: '', updatedAt: '', snapshot: { schemaVersion: 2, settings: { format: 'advert', genre: 'comedy', presetVersion: 1, aspectRatio: '16:9', targetDurationSeconds: 30, language: 'ru' },
      subjectIds: ['character'], blueprint: { purpose: '', audience: '', script: '', visualStyle: '' }, scenes: [{ id: 'scene', title: 'Существующая сцена', description: '', shots: [] }] } } as StoryProject;
  let writes = 0;
  const dependencies: NonNullable<Parameters<typeof prepareStoryBlueprint>[2]> = {
    verify: async (principal, conversationId) => {
      if (principal.userId !== 'author' || principal.tenantId !== current.workspaceId || conversationId !== 'story:bound') throw new Error('access denied');
      return { id: current.id, name: current.name, revision: current.revision, settings: current.snapshot.settings, blueprint: current.snapshot.blueprint, characters: undefined, charactersSkipped: undefined, subjects: [], scenes: current.snapshot.scenes.map((scene) => ({ title: scene.title, description: scene.description })) };
    },
    get: async () => structuredClone(current),
    save: async (_user, id, revision, input) => {
      assert.equal(id, current.id);
      if (revision !== current.revision) throw new StoryError('Версия изменилась', 409, 'revision_conflict');
      writes++; current = { ...current, ...input, revision: revision + 1 }; return structuredClone(current);
    },
  };
  return { dependencies, current: () => current, writes: () => writes, bump: () => { current.revision++; } };
}
test('coauthor creates and revises the same passport used by the UI; replay does not duplicate heroes', async () => {
  const fixture = setup(); const before = structuredClone(fixture.current());
  const request: ToolCallRequest = { toolName: STORY_CHARACTERS_TOOL, riskLevel: 'write', input: { expectedRevision: 0, characters: [{ id: null, passport: testPassport }] } };
  const proposal = await prepareStoryBlueprint(request, context, fixture.dependencies);
  const operation = { ...request, executionRef: proposal.executionRef };
  const result = await callStoryTool(operation, context, fixture.dependencies);
  assert.equal(result.output?.action, 'story-characters-saved');
  assert.deepEqual(fixture.current().snapshot.characters?.[0].passport, testPassport);
  assert.deepEqual(fixture.current().snapshot.blueprint, before.snapshot.blueprint);
  assert.deepEqual(fixture.current().snapshot.scenes, before.snapshot.scenes);
  await callStoryTool(operation, context, fixture.dependencies);
  assert.equal(fixture.writes(), 1); assert.equal(fixture.current().snapshot.characters?.length, 1);
  const character = fixture.current().snapshot.characters![0];
  const edit: ToolCallRequest = { toolName: STORY_CHARACTERS_TOOL, riskLevel: 'write', input: { expectedRevision: 1, characters: [{ id: character.id, passport: { ...testPassport, temperament: ['kind'] } }] } };
  const prepared = await prepareStoryBlueprint(edit, { ...context, verifiedContext: { storyAuthoringRevision: 1 } }, fixture.dependencies);
  await callStoryTool({ ...edit, executionRef: prepared.executionRef }, context, fixture.dependencies);
  assert.equal(fixture.current().snapshot.characters![0].passport.temperament[0], 'kind');
  assert.equal(fixture.current().snapshot.characters![0].revision, 2);
  assert.deepEqual(fixture.current().snapshot.characters![0].previousPassports, [testPassport]);
});
test('new revision-zero story can save a full blueprint while preserving scenes, characters, folder and settings', async () => {
  const fixture = setup(); const before = structuredClone(fixture.current());
  const proposal = await prepareStoryBlueprint(request, context, fixture.dependencies);
  assert.equal(proposal.safePreview.submitAuthorized, true);
  const result = await callStoryTool({ ...request, executionRef: proposal.executionRef }, context, fixture.dependencies);
  assert.equal(result.ok, true); assert.equal(fixture.current().revision, 1);
  assert.deepEqual(fixture.current().snapshot, { ...before.snapshot, blueprint });
  assert.equal(fixture.current().folderId, before.folderId); assert.equal(fixture.current().name, before.name);
  await callStoryTool({ ...request, executionRef: proposal.executionRef }, context, fixture.dependencies);
  assert.equal(fixture.writes(), 1, 'retry does not write a duplicate revision');
});
test('stale document revision cannot prepare or overwrite a newer draft', async () => {
  const fixture = setup(); const proposal = await prepareStoryBlueprint(request, context, fixture.dependencies); fixture.bump();
  await assert.rejects(prepareStoryBlueprint(request, context, fixture.dependencies), /История изменилась/);
  const result = await callStoryTool({ ...request, executionRef: proposal.executionRef }, context, fixture.dependencies);
  assert.equal(result.ok, false); assert.equal(result.safeError?.code, 'revision_conflict'); assert.equal(fixture.writes(), 0);
});
test('cross-workspace or unbound conversations never prepare an action', async () => {
  const fixture = setup();
  for (const patch of [{ tenantId: 'another' }, { userId: 'another' }, { conversationId: 'story:another' }]) {
    await assert.rejects(prepareStoryBlueprint(request, { ...context, ...patch }, fixture.dependencies), /access denied/);
  }
  assert.equal(fixture.writes(), 0);
});
test('missing authoring revision, forged execution target and read-risk writes are refused', async () => {
  const fixture = setup();
  await assert.rejects(prepareStoryBlueprint(request, { ...context, verifiedContext: {} }, fixture.dependencies));
  await assert.rejects(prepareStoryBlueprint({ ...request, riskLevel: 'read' }, context, fixture.dependencies));
  for (const input of [{ ...request, executionRef: 'story-blueprint:another:0' }, { ...request, riskLevel: 'read' as const, executionRef: 'story-blueprint:story-id:0' }]) {
    const result = await callStoryTool(input, context, fixture.dependencies); assert.equal(result.ok, false);
  }
  assert.equal(fixture.writes(), 0);
});
test('question tool returns exactly two bounded choices and rejects overlong lists', async () => {
  const fixture = setup(); const input = { question: 'Какой финал выбираем?', options: [{ label: 'Тёплый', description: 'Герои встречаются' }, { label: 'Открытый', description: 'Путешествие продолжается' }] };
  const result = await callStoryTool({ toolName: STORY_QUESTION_TOOL, riskLevel: 'read', input }, context, fixture.dependencies);
  assert.equal(result.ok, true); assert.deepEqual(result.output, { action: 'story-question', interactionId: context.toolCallId, ...input });
  assert.equal((await callStoryTool({ toolName: STORY_QUESTION_TOOL, riskLevel: 'read', input: { ...input, options: [...input.options, input.options[0]] } }, context, fixture.dependencies)).ok, false);
});
test('story tools are isolated from ordinary text, image and Flow conversations', () => {
  const tools = [...storyAuthoringTools, { name: 'pipeline_build', riskLevel: 'write' as const, inputSchema: {}, description: '' }];
  assert.deepEqual(toolsForAssistantMode(tools, 'general-chat', true), storyAuthoringTools);
  assert.deepEqual(toolsForAssistantMode(tools, 'general-chat'), []);
  assert.deepEqual(toolsForAssistantMode(tools, 'product-copilot').map((tool) => tool.name), ['pipeline_build']);
});

test('first storyboard keeps the blueprint, gives frames unique IDs, and replays without duplicate scenes', async () => {
  const fixture = setup(); fixture.current().snapshot.scenes = []; fixture.current().snapshot.blueprint = blueprint;
  const input = { expectedRevision: 0, scenes: [{ title: 'Через лужу', description: 'Кораблик решается отплыть', shots: [{ description: 'Общий план утренней лужи', durationMs: 5000 }] }] };
  const req: ToolCallRequest = { toolName: 'story_create_scenes', riskLevel: 'write', input };
  const proposal = await prepareStoryBlueprint(req, context, fixture.dependencies);
  const result = await callStoryTool({ ...req, executionRef: proposal.executionRef }, context, fixture.dependencies);
  assert.equal(result.ok, true); assert.equal(result.output?.action, 'story-scenes-saved');
  assert.deepEqual(fixture.current().snapshot.blueprint, blueprint);
  const scene = fixture.current().snapshot.scenes[0]; assert.notEqual(scene.id, scene.shots[0].id);
  assert.equal(scene.shots[0].imageAssetId, null); assert.equal(scene.shots[0].videoAssetId, null);
  await callStoryTool({ ...req, executionRef: proposal.executionRef }, context, fixture.dependencies);
  assert.equal(fixture.writes(), 1);
  await assert.rejects(prepareStoryBlueprint({ ...req, input: { ...input, expectedRevision: 1 } }, { ...context, verifiedContext: { storyAuthoringRevision: 1 } }, fixture.dependencies));
});
