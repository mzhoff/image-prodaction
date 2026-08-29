import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isChatComposerKeyboardPath,
  isExternalEditableKeyboardPath,
  isSelectAllShortcut,
} from './assistant-keyboard-boundary.ts';

test('recognizes the package composer textarea as the active keyboard surface', () => {
  const path = [
    { className: 'cm-composer-textarea', tagName: 'TEXTAREA' },
    { className: 'cm-composer-form cm-composer-form-compact', tagName: 'FORM' },
  ];

  assert.equal(isChatComposerKeyboardPath(path), true);
  assert.equal(isExternalEditableKeyboardPath(path), false);
});

test('isolates editable controls rendered inside the Visual Intent shadow tree', () => {
  assert.equal(isExternalEditableKeyboardPath([
    { tagName: 'TEXTAREA' },
    { id: 'visual-intent-overlay-root', tagName: 'DIV' },
    { tagName: 'BODY' },
  ]), true);
});

test('keeps non-editable canvas shortcuts on their normal event path', () => {
  assert.equal(isExternalEditableKeyboardPath([
    { className: 'production-canvas', tagName: 'DIV' },
    { tagName: 'BODY' },
  ]), false);
});

test('detects the select-all shortcut independently of platform modifier', () => {
  assert.equal(isSelectAllShortcut({ altKey: false, ctrlKey: false, key: 'a', metaKey: true }), true);
  assert.equal(isSelectAllShortcut({ altKey: false, ctrlKey: true, key: 'A', metaKey: false }), true);
  assert.equal(isSelectAllShortcut({ altKey: true, ctrlKey: false, key: 'a', metaKey: true }), false);
});
