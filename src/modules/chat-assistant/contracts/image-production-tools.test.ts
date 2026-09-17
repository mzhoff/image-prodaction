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

test('build and update explain populated settings and opt-in QR consistently', () => {
  for (const name of [PIPELINE_BUILD_TOOL, PIPELINE_UPDATE_TOOL]) {
    const description = imageProductionTools.find((tool) => tool.name === name)!.description;
    assert.match(description, /QR is opt-in.*omit it without asking/u);
    assert.match(description, /earlier assistant-invented QR are not user requirements/u);
    assert.match(description, /complete user brief, not an empty skeleton/u);
    assert.match(description, /textGeneration\.settings\.instruction.*never textGeneration\.settings\.prompt/u);
    assert.match(description, /Set requested aspectRatio/u);
    assert.match(description, /never put @brief or @nodeKey in generateImage\.prompt/u);
  }
});

test('pipeline update contract exposes bounded edits to existing nodes and edges', () => {
  const tool = imageProductionTools.find((candidate) => candidate.name === PIPELINE_UPDATE_TOOL);
  const schema = tool?.inputSchema as { properties?: Record<string, unknown>; required?: string[] };

  assert.deepEqual(schema.required, ['summary']);
  assert.equal('nodes' in (schema.properties ?? {}), true);
  assert.equal('updates' in (schema.properties ?? {}), true);
  assert.equal('removeEdgeIds' in (schema.properties ?? {}), true);
  assert.equal('edges' in (schema.properties ?? {}), true);
  assert.equal('compositionBlueprints' in (schema.properties ?? {}), true);
  assert.match(tool?.description ?? '', /top-level fields.*compositionBlueprints/u);
});

test('write tool descriptions prepare a single UI-confirmed canvas proposal by default', () => {
  const buildDescription = imageProductionTools.find(
    (candidate) => candidate.name === PIPELINE_BUILD_TOOL,
  )?.description ?? '';
  const updateDescription = imageProductionTools.find(
    (candidate) => candidate.name === PIPELINE_UPDATE_TOOL,
  )?.description ?? '';

  for (const description of [buildDescription, updateDescription]) {
    assert.match(description, /never ask for a separate textual confirmation/u);
    assert.match(description, /read-only.*proposal/u);
    assert.match(description, /single UI confirmation/u);
    assert.match(description, /ordinary editable canvas pipeline/u);
    assert.match(description, /only when the user explicitly requests/u);
    assert.match(description, /Executable Pipeline/u);
    assert.doesNotMatch(description, /reviewed the textual plan|approves a textual plan/u);
  }

  assert.match(buildDescription, /build, create, add, change, implement or apply/u);
  assert.match(buildDescription, /separate input, prompt input or editable input.*textPrompt.*not pipelineInput/u);
  assert.match(buildDescription, /pipelineInput field.*variable-N.*public field key.*@Alias/u);
  assert.match(buildDescription, /exportImage\.image-0.*exportImage\.image.*pipelineOutput/u);
  assert.match(buildDescription, /QR is not needed.*omit qrCode.*targetUrl\/target-url.*QR layer/u);
  assert.match(updateDescription, /change, add, implement or apply/u);
  assert.match(updateDescription, /pipelineInput\.field:<id>.*textPrompt variable-N.*public field key/u);
  assert.match(updateDescription, /exportImage\.image-0.*exportImage\.image.*pipelineOutput/u);
  assert.match(buildDescription, /audioConvert\.source -> audioConvert\.audio/u);
  assert.match(buildDescription, /managed private Workspace assets, not URLs or base64/u);
  assert.match(buildDescription, /do not force mediaKind, forge asset ids or use sourceAttachmentIndex for audio\/video/u);
  assert.match(updateDescription, /sourceAttachmentIndex remains image-only/u);
  assert.match(buildDescription, /Video exposes original \(video with audio\), video \(silent video\), audio \(selected audio track\)/u);
  assert.match(buildDescription, /videoAudioTrackIndex must be an existing stream index/u);
  assert.match(buildDescription, /Voice accepts up to 30000 characters.*Over 5000 characters.*one MP3/u);
  assert.match(buildDescription, /each part is paid.*does not clone a voice/u);
});

test('pipeline tool keeps graph structure strict while settings stay bounded and recoverable', () => {
  const tool = imageProductionTools.find((candidate) => candidate.name === PIPELINE_BUILD_TOOL);
  const inputSchema = tool?.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  } | undefined;
  const nodes = (inputSchema?.properties?.nodes as {
    items?: { description?: string; properties?: Record<string, unknown> };
  } | undefined)?.items;
  const edgeItem = (inputSchema?.properties?.edges as {
    items?: { description?: string; properties?: Record<string, unknown> };
  } | undefined)?.items;
  const settingProperties = (
    nodes?.properties?.settings as {
      additionalProperties?: unknown;
      maxProperties?: number;
      properties?: Record<string, unknown>;
    } | undefined
  )?.properties;

  assert.equal((nodes?.properties?.type as { enum?: string[] } | undefined)?.enum?.includes('textFormatter'), true);
  assert.equal((nodes?.properties?.type as { enum?: string[] } | undefined)?.enum?.includes('qrCode'), true);
  assert.equal((nodes?.properties?.type as { enum?: string[] } | undefined)?.enum?.includes('speechToText'), true);
  assert.equal((nodes?.properties?.type as { enum?: string[] } | undefined)?.enum?.includes('audioConvert'), true);
  assert.equal(inputSchema?.required?.includes('documentName'), true);
  assert.equal('documentName' in (inputSchema?.properties ?? {}), true);
  assert.equal('presetId' in (settingProperties ?? {}), true);
  assert.equal('variables' in (settingProperties ?? {}), true);
  assert.equal('content' in (settingProperties ?? {}), true);
  assert.equal('contentMode' in (settingProperties ?? {}), true);
  for (const audioSetting of ['bitrateKbps', 'sampleRateHz', 'channels', 'language', 'responseFormat', 'voice', 'speed']) {
    assert.equal(audioSetting in (settingProperties ?? {}), true);
  }
  for (const advancedQrSetting of [
    'errorCorrectionLevel', 'foregroundColor', 'backgroundColor',
    'margin', 'pixelSize', 'outputFormat',
  ]) {
    assert.equal(advancedQrSetting in (settingProperties ?? {}), false);
  }
  assert.equal((nodes?.properties?.settings as { maxProperties?: number } | undefined)?.maxProperties, 24);
  assert.ok((nodes?.properties?.settings as { additionalProperties?: unknown } | undefined)?.additionalProperties);
  assert.match(nodes?.description ?? '', /only key, type.*settings.*sourceAttachmentIndex.*title.*inside settings/u);
  const variablesSchema = settingProperties?.variables as {
    anyOf?: Array<{ description?: string }>;
  } | undefined;
  assert.match(
    variablesSchema?.anyOf?.find((candidate) => candidate.description)?.description ?? '',
    /Pipeline Input field.*field\.key/u,
  );
  assert.match(edgeItem?.description ?? '', /only four scalar string fields.*Do not add nested source\/target/u);
  assert.match(
    (edgeItem?.properties?.sourceNodeKey as { description?: string } | undefined)?.description ?? '',
    /copied exactly.*nodes\[\]\.key.*never an object/u,
  );
  assert.match(
    (edgeItem?.properties?.targetNodeKey as { description?: string } | undefined)?.description ?? '',
    /copied exactly.*nodes\[\]\.key.*never an object/u,
  );
});
