import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QR_CODE_DEFAULTS,
  QrCodeValidationError,
  normalizeQrCodeContent,
  normalizeQrCodeOptions,
} from './qr-code-contract';

test('QR options use the safe first-release defaults', () => {
  assert.deepEqual(normalizeQrCodeOptions({}), QR_CODE_DEFAULTS);
});

test('QR URL content accepts absolute HTTP URLs without fetching them', () => {
  assert.equal(
    normalizeQrCodeContent('  https://talkberry.example/register?campaign=pilot  ', 'url'),
    'https://talkberry.example/register?campaign=pilot',
  );
});

test('QR text mode accepts ordinary non-empty text', () => {
  assert.equal(normalizeQrCodeContent(' TalkBerry pilot ', 'text'), 'TalkBerry pilot');
});

test('QR URL content rejects unsafe protocols, credentials, controls, and excess bytes', () => {
  for (const value of [
    'javascript:alert(1)',
    'ftp://example.com/file',
    'https://user:secret@example.com/',
    'https://example.com/\nnext',
    `https://example.com/${'a'.repeat(2_100)}`,
  ]) {
    assert.throws(
      () => normalizeQrCodeContent(value, 'url'),
      (error: unknown) => error instanceof QrCodeValidationError
        && !error.message.includes(value),
    );
  }
});

test('QR options allow content mode changes while keeping the V1 rendering profile fixed', () => {
  assert.deepEqual(normalizeQrCodeOptions({
    backgroundColor: '#ffffff',
    contentMode: 'text',
    errorCorrectionLevel: 'M',
    foregroundColor: '#000000',
    margin: 4,
    outputFormat: 'png',
    pixelSize: 1024,
  }), {
    backgroundColor: '#FFFFFF',
    contentMode: 'text',
    errorCorrectionLevel: 'M',
    foregroundColor: '#000000',
    margin: 4,
    outputFormat: 'png',
    pixelSize: 1024,
  });

  for (const options of [
    { backgroundColor: '#FEFEFE' },
    { errorCorrectionLevel: 'H' },
    { foregroundColor: '#123ABC' },
    { margin: 6 },
    { outputFormat: 'svg' },
    { pixelSize: 2048 },
  ]) {
    assert.throws(() => normalizeQrCodeOptions(options), QrCodeValidationError);
  }
});
