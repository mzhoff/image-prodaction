import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasFileDrag,
  shouldCaptureAssistantAttachmentDrop,
} from './assistant-attachment-drop.ts';

test('recognizes browser file drags without depending on case', () => {
  assert.equal(hasFileDrag(['text/plain', 'Files']), true);
  assert.equal(hasFileDrag(['text/plain']), false);
});

test('captures file drops only for an open assistant with a registered target', () => {
  const base = {
    activeTab: 'assistant' as const,
    hasDropTarget: true,
    isOpen: true,
    types: ['Files'],
  };
  assert.equal(shouldCaptureAssistantAttachmentDrop(base), true);
  assert.equal(shouldCaptureAssistantAttachmentDrop({ ...base, activeTab: 'feedback' }), false);
  assert.equal(shouldCaptureAssistantAttachmentDrop({ ...base, hasDropTarget: false }), false);
  assert.equal(shouldCaptureAssistantAttachmentDrop({ ...base, isOpen: false }), false);
  assert.equal(shouldCaptureAssistantAttachmentDrop({ ...base, fileCount: 1, types: [] }), true);
});
