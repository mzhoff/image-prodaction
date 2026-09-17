import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { compileStudioSection } from '@/modules/executable-pipelines/adapters/studio/studio-pipeline-compiler';
import { isProductionPipelineHandlerSupported } from '@/modules/executable-pipelines/server/pipeline-production-manifest';
import { contentHubPilotRecipes, createContentHubPilotSnapshot } from './content-hub-pilot-recipes';

for (const recipe of contentHubPilotRecipes) {
  test(`${recipe.capabilityKey}: real Studio compilation retains brief/draft and has one provider node`, () => {
    const snapshot = validateDocumentSnapshot(createContentHubPilotSnapshot(recipe, 'google/gemini-2.5-flash'));
    const result = compileStudioSection(snapshot.project, recipe.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
    assert.equal(result.sourceMetadata.capabilityKey, recipe.capabilityKey);
    assert.deepEqual(result.compiledPlan.definition.inputs, { brief: { kind: 'text', required: true } });
    assert.deepEqual(result.compiledPlan.definition.outputContracts, { [recipe.capabilityKey === 'channels.analyze-telegram-sample' ? 'analysis' : 'draft']: { kind: 'text', required: true } });
    assert.equal(result.compiledPlan.definition.nodes.length, 1);
    assert.equal(result.compiledPlan.definition.nodes[0].handlerType, 'ai.text.generate');
    assert.equal(snapshot.project.assets.length, 0);
    assert.equal(snapshot.project.runs.length, 0);
    assert.equal(snapshot.project.publications.length, 0);
    assert.match(recipe.instruction, /Не выдумывай/);
    if (recipe.capabilityKey === 'channels.analyze-telegram-sample') {
      assert.match(recipe.instruction, /НЕ исследование рынка/);
      assert.match(recipe.instruction, /Никаких автоматических изменений/);
    } else {
      assert.match(recipe.instruction, /Нужно добавить/);
      assert.match(recipe.instruction, /Ничего не отправляй и не публикуй/);
    }
  });
}
