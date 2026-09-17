import assert from 'node:assert/strict';
import test from 'node:test';
import { getVoiceAuditions } from '@/shared/media/voice-preview-catalog';
import { splitProductionText } from './text-splitter';

test('audition names and scripts split into matching slots with the current delimiter-only UI', () => {
  const auditions = getVoiceAuditions();
  for (const model of new Set(auditions.map((item) => item.model))) {
    const voices = auditions.filter((item) => item.model === model);
    assert.ok(voices.length <= 30);
    const names = voices.map((item) => item.voice);
    const scripts = voices.map((item) => item.recordingText);
    assert.deepEqual(splitProductionText(names.join('\n===VOICE===\n'), 'delimiter', '===VOICE==='), names);
    assert.deepEqual(splitProductionText(scripts.join('\n===VOICE===\n'), 'delimiter', '===VOICE==='), scripts);
  }
});
