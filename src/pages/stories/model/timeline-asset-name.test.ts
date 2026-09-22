import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateMessage } from '@/shared/i18n/translate';
import { timelineAssetName } from './timeline-asset-name';

test('timeline localizes automatic labels while preserving user filenames', () => {
  const asset = { id: 'asset', originalName: 'generated-123.png', mediaKind: 'image' as const, status: 'ready', modelId: 'provider/model-name' };
  const translate = (source: string) => translateMessage('en', source);
  assert.equal(timelineAssetName(asset), 'Изображение · model name');
  assert.equal(timelineAssetName(asset, 'en-US', translate), 'Image · model name');
  assert.equal(timelineAssetName({ ...asset, originalName: 'Моя фотография.png' }, 'en-US', translate), 'Моя фотография.png');
  assert.equal(asset.originalName, 'generated-123.png');
});
