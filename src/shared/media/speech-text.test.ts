import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SPEECH_CHUNKS, MAX_SPEECH_REQUEST_CHARACTERS, splitSpeechText } from './speech-text';

test('speech splitting preserves every source character, order and offsets', () => {
  const text = ('Первое предложение: 42 рубля. Второе предложение — без потерь!\n\n').repeat(320).trim();
  const parts = splitSpeechText(text);
  assert.equal(parts.map((part) => part.text).join(''), text);
  assert.ok(parts.length > 1 && parts.length <= MAX_SPEECH_CHUNKS);
  for (const [index, part] of parts.entries()) {
    assert.equal(part.index, index);
    assert.equal(part.startOffset, index ? parts[index - 1]!.endOffset : 0);
    assert.equal(part.text, text.slice(part.startOffset, part.endOffset));
    assert.ok(part.text.length <= MAX_SPEECH_REQUEST_CHARACTERS);
  }
});

test('short text remains one provider request and long paragraphs prefer sentence boundaries', () => {
  assert.equal(splitSpeechText('a'.repeat(5000)).length, 1);
  const parts = splitSpeechText('Sentence ends here. '.repeat(600));
  assert.ok(parts.slice(0, -1).every((part) => part.text.endsWith('. ')));
});

test('unbroken text and surrogate pairs cannot violate chunk limits or lose content', () => {
  for (const text of ['a'.repeat(30_000), ('a' + '😀'.repeat(14999))]) {
    const parts = splitSpeechText(text);
    assert.equal(parts.map((part) => part.text).join(''), text);
    assert.ok(parts.every((part) => part.text.isWellFormed() && part.text.length <= 5000));
  }
  assert.throws(() => splitSpeechText('x'.repeat(30_001)));
  assert.throws(() => splitSpeechText(' \n '));
});
