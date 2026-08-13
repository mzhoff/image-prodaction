import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENT_GRAPH_TOOL,
  imageProductionTools,
  PIPELINE_BUILD_TOOL,
  PIPELINE_UPDATE_TOOL,
} from './image-production-tools.ts';

test('assistant tool names are compatible with OpenAI-compatible providers', () => {
  const names = imageProductionTools.map((tool) => tool.name);

  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.match(name, /^[a-zA-Z0-9_-]+$/);
  }
  assert.equal(imageProductionTools.find((tool) => tool.name === PIPELINE_BUILD_TOOL)?.riskLevel, 'write');
  assert.equal(imageProductionTools.find((tool) => tool.name === PIPELINE_UPDATE_TOOL)?.riskLevel, 'write');
  assert.equal(imageProductionTools.find((tool) => tool.name === DOCUMENT_GRAPH_TOOL)?.riskLevel, 'read');
});

test('pipeline update contract exposes bounded edits to existing nodes and edges', () => {
  const tool = imageProductionTools.find((candidate) => candidate.name === PIPELINE_UPDATE_TOOL);
  const schema = tool?.inputSchema as { properties?: Record<string, unknown>; required?: string[] };

  assert.deepEqual(schema.required, ['summary']);
  assert.equal('nodes' in (schema.properties ?? {}), true);
  assert.equal('updates' in (schema.properties ?? {}), true);
  assert.equal('removeEdgeIds' in (schema.properties ?? {}), true);
  assert.equal('edges' in (schema.properties ?? {}), true);
});

test('pipeline tool keeps graph structure strict while settings stay bounded and recoverable', () => {
  const tool = imageProductionTools.find((candidate) => candidate.name === PIPELINE_BUILD_TOOL);
  const inputSchema = tool?.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  } | undefined;
  const nodes = (inputSchema?.properties?.nodes as {
    items?: { properties?: Record<string, unknown> };
  } | undefined)?.items;
  const settingProperties = (
    nodes?.properties?.settings as {
      additionalProperties?: unknown;
      maxProperties?: number;
      properties?: Record<string, unknown>;
    } | undefined
  )?.properties;

  assert.equal((nodes?.properties?.type as { enum?: string[] } | undefined)?.enum?.includes('textFormatter'), true);
  assert.equal(inputSchema?.required?.includes('documentName'), true);
  assert.equal('documentName' in (inputSchema?.properties ?? {}), true);
  assert.equal('presetId' in (settingProperties ?? {}), true);
  assert.equal('variables' in (settingProperties ?? {}), true);
  assert.equal((nodes?.properties?.settings as { maxProperties?: number } | undefined)?.maxProperties, 24);
  assert.ok((nodes?.properties?.settings as { additionalProperties?: unknown } | undefined)?.additionalProperties);
});
