import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNodeAskAiDraft,
  NODE_HELP_METADATA,
} from './node-help.ts';
import {
  getNodeDefinition,
  PRODUCTION_NODE_TYPES,
} from './node-registry.ts';

test('node help metadata is an exact complete record for all production node types', () => {
  assert.deepEqual(Object.keys(NODE_HELP_METADATA), PRODUCTION_NODE_TYPES);
  assert.equal(Object.keys(NODE_HELP_METADATA).length, 30);
});

test('Ask AI draft uses only the canonical label and type for every node', () => {
  for (const type of PRODUCTION_NODE_TYPES) {
    const label = getNodeDefinition(type).menuLabel;
    assert.equal(
      buildNodeAskAiDraft(type),
      `Расскажи, что такое нода «${label}» (тип ${type}) в Image Production, для чего она нужна и когда её использовать. Объясни её входы, выходы и ключевые настройки, перечисли возможности и ограничения, затем приведи короткий пример связки с другими нодами. Используй актуальный node_catalog. Ничего не изменяй в текущем документе — нужен только ответ.`,
    );
  }
});

test('Ask AI draft contains no node instance data or identifier', () => {
  const draft = buildNodeAskAiDraft('imageToText');

  assert.match(draft, /нода «Extract» \(тип imageToText\)/u);
  assert.doesNotMatch(draft, /node-[a-z0-9]|sourceId|nodeId|assetId|настройки текущей ноды/iu);
});
