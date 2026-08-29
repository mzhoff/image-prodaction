import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node.ts';
import { getNodeImageAssetId, getNodeImageOutputAssetIds } from './graph-image-outputs.ts';
import { canConnectPorts, getNodePorts } from './node-definitions.ts';
import { normalizeNode } from './normalize-project-node.ts';
import type { ProductionNode, QrCodeNodeData } from './types.ts';

test('QR Code defaults expose a text input and PNG image output', () => {
  const node = createDefaultNode('qrCode', { x: 20, y: 40 });
  const data = node.data as QrCodeNodeData;

  assert.equal(node.type, 'qrCode');
  assert.equal(data.contentMode, 'url');
  assert.equal(data.errorCorrectionLevel, 'M');
  assert.equal(data.foregroundColor, '#000000');
  assert.equal(data.backgroundColor, '#FFFFFF');
  assert.equal(data.margin, 4);
  assert.equal(data.outputFormat, 'png');
  assert.equal(data.pixelSize, 1024);
  assert.deepEqual(getNodePorts(node), [
    { id: 'text', label: 'URL / text', kind: 'text', side: 'input' },
    { id: 'image', label: 'QR image', kind: 'image', side: 'output' },
  ]);
});

test('QR Code normalization repairs malformed settings without breaking document load', () => {
  const base = createDefaultNode('qrCode', { x: 0, y: 0 });
  const normalized = normalizeNode({
    ...base,
    data: {
      title: '',
      content: 'https://talkberry.example/register',
      contentMode: 'invalid',
      errorCorrectionLevel: 'H',
      foregroundColor: '#112233',
      backgroundColor: '#F7F7F7',
      margin: 6,
      outputFormat: 'svg',
      pixelSize: 2048,
      resultAssetId: 123,
      resultSignature: false,
    } as never,
  });
  const data = normalized.data as QrCodeNodeData;

  assert.equal(data.title, 'QR Code');
  assert.equal(data.content, 'https://talkberry.example/register');
  assert.equal(data.contentMode, 'url');
  assert.equal(data.errorCorrectionLevel, 'M');
  assert.equal(data.foregroundColor, '#000000');
  assert.equal(data.backgroundColor, '#FFFFFF');
  assert.equal(data.margin, 4);
  assert.equal(data.outputFormat, 'png');
  assert.equal(data.pixelSize, 1024);
  assert.equal(data.resultAssetId, undefined);
  assert.equal(data.resultSignature, undefined);
});

test('QR Code connects text to image composition and exposes its generated asset', () => {
  const text = createDefaultNode('textPrompt', { x: 0, y: 0 });
  const qr = createDefaultNode('qrCode', { x: 300, y: 0 });
  const composition = createDefaultNode('composition', { x: 600, y: 0 });
  const generated = {
    ...qr,
    data: {
      ...qr.data,
      resultAssetId: 'asset-qr',
      resultSignature: 'qr:v1:12345678',
    },
  } as ProductionNode;

  assert.equal(canConnectPorts(text, 'text', qr, 'text'), true);
  assert.equal(canConnectPorts(qr, 'image', composition, 'layer-0'), true);
  assert.equal(canConnectPorts(qr, 'image', qr, 'text'), false);
  assert.equal(getNodeImageAssetId(generated), 'asset-qr');
  assert.deepEqual(getNodeImageOutputAssetIds(generated), ['asset-qr']);
});
