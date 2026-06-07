import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFilteredTextSectionText,
  getTextSectionDuplicateIssues,
  parseTextSectionFilters,
} from './text-section-filters.ts';

test('parseTextSectionFilters keeps labels exactly as written in square brackets', () => {
  const filters = parseTextSectionFilters([
    '[STYLE]',
    'Visual style text.',
    '',
    '[Light]',
    'Lighting text.',
  ].join('\n'));

  assert.deepEqual(filters.map((filter) => filter.label), ['STYLE', 'Light']);
});

test('getFilteredTextSectionText excludes disabled section content from output', () => {
  const source = [
    'Intro',
    '',
    '[Actors]',
    'Actor description.',
    '',
    '[Actions]',
    'Action description.',
  ].join('\n');

  assert.equal(getFilteredTextSectionText(source, ['actors']), [
    'Intro',
    '',
    '[Actions]',
    'Action description.',
  ].join('\n'));
});

test('duplicate section names are reported and ignored as additional filters', () => {
  const source = [
    '[Actor]',
    'First actor section.',
    '',
    '[actor]',
    'Duplicate actor section.',
  ].join('\n');
  const filters = parseTextSectionFilters(source);
  const issues = getTextSectionDuplicateIssues(source);

  assert.equal(filters.length, 1);
  assert.equal(filters[0].label, 'Actor');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].header, '[actor]');
});
