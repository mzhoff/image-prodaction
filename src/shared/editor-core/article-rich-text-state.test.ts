import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPlainTextFromArticleRichText,
  normalizeArticleRichText,
  normalizeEditorUrl,
} from './article-rich-text-state';

test('article rich text normalization accepts only a serialized Lexical root', () => {
  const valid = JSON.stringify({ root: { children: [] } });
  assert.equal(normalizeArticleRichText(valid), valid);
  assert.equal(normalizeArticleRichText('{"root":{}}'), '');
  assert.equal(normalizeArticleRichText('not-json'), '');
  assert.equal(normalizeArticleRichText(undefined), '');
});

test('article rich text extracts readable text from blocks, lists and images', () => {
  const richText = JSON.stringify({ root: { children: [
    { type: 'paragraph', children: [{ type: 'text', text: 'Intro' }] },
    { type: 'list', children: [
      { type: 'listitem', children: [{ type: 'text', text: 'First' }] },
      { type: 'listitem', children: [{ type: 'text', text: 'Second' }] },
    ] },
    { type: 'paragraph', children: [{ type: 'article-image' }] },
  ] } });
  assert.equal(getPlainTextFromArticleRichText(richText), 'Intro\n\nFirst\n\nSecond\n\n[Image]');
  assert.equal(getPlainTextFromArticleRichText('invalid'), '');
});

test('article editor URL normalization keeps safe supported schemes', () => {
  assert.equal(normalizeEditorUrl('example.com/page'), 'https://example.com/page');
  assert.equal(normalizeEditorUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeEditorUrl('data:image/png;base64,AA'), 'data:image/png;base64,AA');
  assert.equal(normalizeEditorUrl('  '), '');
});
