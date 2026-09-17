import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVideoProviderDiagnostic, VideoProviderError } from './video-provider-error';

test('unwraps the actual OpenRouter nested Seedance error and keeps a safe request ID', () => {
  const inner = { error: { code: 'InputImageSensitiveContentDetected.PrivacyInformation',
    message: "The request failed because the input image 'content[1]' may contain real person. Request id: test-request-123" } };
  const result = normalizeVideoProviderDiagnostic({ httpStatus: 400, body: { error: { code: 400, message: `HTTP 400: ${JSON.stringify(inner)}` } } });
  assert.equal(result.code, 'video_input_person_restricted');
  assert.equal(result.providerCode, inner.error.code);
  assert.equal(result.requestId, 'test-request-123');
  assert.match(result.message, /реальный человек/);
  assert.equal(new VideoProviderError(result).rejectionConfirmed, true);
});

test('only explicit insufficient funds is a balance error; provider causes remain distinct', () => {
  for (const [httpStatus, code] of [[400, 'video_invalid_request'], [401, 'video_access_denied'],
    [402, 'video_insufficient_balance'], [429, 'video_rate_limited'], [500, 'video_provider_error']] as const) {
    assert.equal(normalizeVideoProviderDiagnostic({ body: {}, httpStatus }).code, code);
  }
  for (const httpStatus of [408, 500, 502, 503, 504]) {
    assert.equal(new VideoProviderError(normalizeVideoProviderDiagnostic({ httpStatus, body: {} })).rejectionConfirmed, false);
  }
});

test('explains the actual asynchronous Seedance output-audio copyright rejection', () => {
  const result = normalizeVideoProviderDiagnostic({ httpStatus: null,
    body: 'The request failed because the output audio may be related to copyright restrictions. Request id: audio-request-123' });
  assert.equal(result.code, 'video_audio_content_rejected');
  assert.equal(result.requestId, 'audio-request-123');
  assert.match(result.message, /без звука/);
  assert.doesNotMatch(result.message, /баланс|HTTP/);
});

test('bounds provider text and redacts credentials, input prompts, inline media and signed URLs', () => {
  const secret = 'not-a-standard-format-secret';
  const prompt = 'private client prompt';
  const result = normalizeVideoProviderDiagnostic({ httpStatus: 400, secrets: [secret, prompt], body: { error: {
    message: `${secret} ${prompt} sk-or-v1-another-secret Bearer unknown-credential data:image/jpeg;base64,AAAA https://storage.invalid/frame?token=signed-secret ${'x'.repeat(2000)}`,
  } } });
  assert.ok((result.detail?.length ?? 0) <= 900);
  assert.doesNotMatch(JSON.stringify(result), /not-a-standard|private client|another-secret|unknown-credential|AAAA|signed-secret/);
});
