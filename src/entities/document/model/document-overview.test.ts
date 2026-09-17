import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { getContentHubStarterPreset } from '@/entities/production-graph/model/content-hub-starter-preset';
import { createDocumentOverviewSvg, hasDocumentOverview } from './document-overview';

test('all five automatically provisioned Content Hub graphs render without opening the editor', async () => {
  for (const entry of getContentHubStarterPreset()) {
    const svg = createDocumentOverviewSvg(entry.snapshot);
    assert.ok(svg);
    assert.ok(svg.includes('<path'), entry.capabilityKey);
    assert.ok(svg.includes('<clipPath'), entry.capabilityKey);
    const { data, info } = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 840);
    assert.equal(info.height, 500);
    assert.ok(data.length > 1_000);
  }
});

test('empty documents have no preview, section-only documents do', () => {
  const snapshot = getContentHubStarterPreset()[0].snapshot;
  snapshot.project.nodes = [];
  snapshot.project.edges = [];
  assert.ok(createDocumentOverviewSvg(snapshot));
  snapshot.project.sections = [];
  assert.equal(createDocumentOverviewSvg(snapshot), null);
  assert.equal(hasDocumentOverview(undefined), false);
});

test('untrusted text and section colors cannot inject SVG elements or external resources', async () => {
  const snapshot = getContentHubStarterPreset()[0].snapshot;
  snapshot.project.nodes[0].data.title = '<script>alert(1)</script>';
  snapshot.project.nodes[1].data = { title: 'Unsafe content', text: '<image href="https://evil.example/x"/> & text\u0000' };
  snapshot.project.sections[0].color = '"><image href="file:///etc/passwd"/>';
  const svg = createDocumentOverviewSvg(snapshot)!;
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(!svg.includes('<image'));
  assert.ok(!svg.includes('file:///'));
  assert.ok(!svg.includes('\u0000'));
  await sharp(Buffer.from(svg)).png().toBuffer();
});

test('legacy geometry, extreme coordinates and dangling edges produce a bounded image', async () => {
  const snapshot = getContentHubStarterPreset()[0].snapshot;
  snapshot.project.nodes[0].position = { x: Infinity, y: -Infinity };
  snapshot.project.nodes[0].size = { width: -1, height: NaN };
  snapshot.project.nodes[1].position = { x: 1e30, y: -1e30 };
  snapshot.project.edges.push({ id: 'dangling', sourceNodeId: 'missing', sourcePortId: '', targetNodeId: 'missing', targetPortId: '' });
  const svg = createDocumentOverviewSvg(snapshot)!;
  assert.doesNotMatch(svg, /NaN|Infinity/);
  await sharp(Buffer.from(svg)).png().toBuffer();
});
