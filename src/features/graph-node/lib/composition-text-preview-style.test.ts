import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompositionLayerView } from '../model/composition-model-types.ts';
import { getCompositionCanvasFontFamily, getCompositionCssFontFamily } from './composition-font-family.ts';
import { getCompositionTextPreviewStyle, getCompositionTextVerticalJustification } from './composition-text-preview-style.ts';

const style = {
  align: 'right',
  blendMode: 'normal',
  blur: 0,
  color: '#123456',
  cornerRadius: 0,
  fit: 'fit',
  fillOpacity: 100,
  flipX: false,
  flipY: false,
  fontFamily: 'Onest',
  fontSize: 64,
  fontWeight: '500',
  height: 300,
  letterSpacing: 12,
  lineHeight: 84,
  locked: false,
  opacity: 100,
  preserveAspectRatio: false,
  rotation: 0,
  sizingMode: 'fixed',
  verticalAlign: 'bottom',
  visible: true,
  width: 600,
  x: 0,
  y: 0,
} satisfies CompositionLayerView['style'];

test('text preview maps every typography setting to a visible CSS property', () => {
  assert.deepEqual(getCompositionTextPreviewStyle(style, 1280), {
    backgroundClip: undefined,
    backgroundImage: undefined,
    color: '#123456',
    fontFamily: 'var(--font-onest), "Onest", Inter, Arial, sans-serif',
    fontKerning: 'normal',
    fontSize: '5cqw',
    fontWeight: '500',
    letterSpacing: '0.6cqw',
    lineHeight: '6.5625cqw',
    textAlign: 'right',
    WebkitBackgroundClip: undefined,
    WebkitTextFillColor: undefined,
  });
  assert.equal(getCompositionTextVerticalJustification(style.verticalAlign), 'flex-end');
  assert.equal(getCompositionTextVerticalJustification('center'), 'center');
  assert.equal(getCompositionTextVerticalJustification('top'), 'flex-start');
});

test('Onest uses the Next font variable in CSS and its resolved family in Canvas', () => {
  assert.equal(getCompositionCssFontFamily('Onest'), 'var(--font-onest), "Onest", Inter, Arial, sans-serif');
  assert.equal(
    getCompositionCanvasFontFamily('Onest', { onest: '"__Onest_abc", "__Onest_Fallback_abc"' }),
    '"__Onest_abc", "__Onest_Fallback_abc", "Onest", Inter, Arial, sans-serif',
  );
  assert.equal(getCompositionCanvasFontFamily('Inter, Arial, sans-serif'), 'Inter, Arial, sans-serif');
  assert.equal(getCompositionCanvasFontFamily('Georgia, serif'), 'Georgia, serif');
});

test('text preview preserves negative letter spacing used by the Canvas renderer', () => {
  assert.equal(
    getCompositionTextPreviewStyle({ ...style, letterSpacing: -25 }, 1280).letterSpacing,
    '-1.25cqw',
  );
});
