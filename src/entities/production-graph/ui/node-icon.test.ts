import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRODUCTION_NODE_TYPES } from '../model/node-registry';
import { NODE_ICONS, NodeIcon } from './node-icon';

test('every registered node type has a distinct actual SVG glyph, not just a different alias', () => {
  assert.deepEqual(Object.keys(NODE_ICONS).sort(), [...PRODUCTION_NODE_TYPES].sort());
  const geometryOwners = new Map<string, string>();
  for (const nodeType of PRODUCTION_NODE_TYPES) {
    const svg = renderToStaticMarkup(createElement(NodeIcon, { nodeType, size: 16 }));
    assert.match(svg, new RegExp(`data-node-icon="${nodeType}"`));
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    // Ignore the outer class/label/size: compare the actual rendered paths.
    const geometry = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    assert.ok(geometry.length > 0, `${nodeType}: empty icon`);
    assert.ok(!geometryOwners.has(geometry), `${nodeType} duplicates ${geometryOwners.get(geometry)}`);
    geometryOwners.set(geometry, nodeType);
  }
});

test('node icons preserve consumer sizing and styling without changing their identity', () => {
  for (const size of [14, 16, 24]) {
    const svg = renderToStaticMarkup(createElement(NodeIcon, { nodeType: 'textGeneration', size, className: 'qa-icon' }));
    assert.match(svg, new RegExp(`width="${size}"`));
    assert.match(svg, /qa-icon/);
    assert.match(svg, /data-node-icon="textGeneration"/);
  }
});
