import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLLAPSED_NODE_PORT_TOP,
  getCollapsedTextSplitterOutputPorts,
  getExtractNodeCollapseLayout,
} from './collapsed-node-layout';

test('Extract full-card collapse hides the body without changing subsection state', () => {
  const sections = {
    promptOpen: false,
    resultOpen: true,
    settingsOpen: false,
  };

  const collapsed = getExtractNodeCollapseLayout(true, sections);
  const expanded = getExtractNodeCollapseLayout(false, collapsed.sections);

  assert.equal(collapsed.bodyVisible, false);
  assert.equal(collapsed.portTop, COLLAPSED_NODE_PORT_TOP);
  assert.equal(expanded.bodyVisible, true);
  assert.equal(expanded.portTop, undefined);
  assert.deepEqual(expanded.sections, sections);
});

test('collapsed Text Splitter exposes one visual output while retaining item anchors', () => {
  const ports = getCollapsedTextSplitterOutputPorts(3);

  assert.deepEqual(ports.map((port) => port.id), ['items', 'item-0', 'item-1', 'item-2']);
  assert.deepEqual(ports.filter((port) => !port.visuallyHidden).map((port) => port.id), ['items']);
  assert.deepEqual(ports.filter((port) => port.visuallyHidden).map((port) => port.id), ['item-0', 'item-1', 'item-2']);
});

test('collapsed Text Splitter normalizes invalid item counts', () => {
  assert.deepEqual(getCollapsedTextSplitterOutputPorts(Number.NaN), [
    { id: 'items', label: 'Items', visuallyHidden: false },
  ]);
  assert.equal(getCollapsedTextSplitterOutputPorts(-3).length, 1);
  assert.equal(getCollapsedTextSplitterOutputPorts(2.9).length, 3);
});
