import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoryDocumentDraftV1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import { applyStoriesAuthoringProfile, assertStoriesDraftFitsHost, getStoriesAuthoringActions, parseStoriesAuthoringProfileBundle, type StoriesAuthoringProfileBundle } from './stories-authoring-profile';

function fixture(): StoriesAuthoringProfileBundle {
  return { schemaVersion: 'stories.authoring-profile-bundle@1',
    hostProfile: { schemaVersion: 'stories.profile@3.0.0', profileKey: 'tokberi.local.v3', placementKey: 'tokberi.station_sheet.how_it_works', rendererVersion: '3.0.0', allowedAssetSourceKinds: ['remote'], allowedRemoteAssetHosts: ['cdn.example.com'], allowedMediaKinds: ['image', 'video'], allowedLayerKinds: ['title', 'subtitle', 'text', 'poll', 'actions'], allowedBusinessActionIds: ['support.open'], allowedPollModes: ['single', 'multiple'], allowedStyleProfileIds: ['reverie-default'], allowedBaseProfileKeys: ['reverie'], allowedFontFamilyAliases: ['heading', 'body'], fallbackKey: 'how_it_works' },
    styleProfile: { schemaVersion: 'stories.style-profile@1.0.0', profileId: 'reverie-default', revisionId: 'reverie-default-r1', name: 'REVERIE', baseProfileKey: 'reverie', tokens: { typography: { title: { fontFamilyAlias: 'heading' } } } },
  };
}
function draft(): StoryDocumentDraftV1 {
  return { schemaVersion: 'stories.document-draft@1.0.0', id: 'draft', revisionId: 'revision', locale: 'ru-RU', preview: { title: '', accessibilityLabel: '' }, slides: [{ id: 'slide', accessibilityLabel: '', layoutIntent: 'fullBleedOverlay', advance: { mode: 'manual' }, layers: [{ id: 'title', kind: 'title', text: 'Сохраняем текст', contrastIntent: 'lightContent', layout: { region: 'bottom', order: 0, alignment: 'start' } }] }] };
}
test('profile bundle accepts the shared host and exact style revision', () => {
  assert.deepEqual(parseStoriesAuthoringProfileBundle(fixture()), fixture());
  assert.deepEqual(getStoriesAuthoringActions(fixture()), [{ id: 'support.open', label: 'Поддержка' }]);
});
test('profile import rejects malformed files and unrecognized wrapper fields', () => {
  assert.throws(() => parseStoriesAuthoringProfileBundle({ ...fixture(), token: 'not-a-configuration' }));
  assert.throws(() => parseStoriesAuthoringProfileBundle({ ...fixture(), hostProfile: {} }));
});
test('profile import rejects a style not allowed by the application', () => {
  const bundle = fixture(); bundle.styleProfile.profileId = 'another-style';
  assert.throws(() => parseStoriesAuthoringProfileBundle(bundle), /не разрешён/);
});
test('profile and mandatory host override fonts must both be allowlisted', () => {
  const bundle = fixture(); bundle.styleProfile.tokens.typography = { title: { fontFamilyAlias: 'unknown' } };
  assert.throws(() => parseStoriesAuthoringProfileBundle(bundle), /шрифтов/);
  const overridden = fixture(); overridden.hostProfile.styleOverrides = { typography: { body: { fontFamilyAlias: 'unknown' } } };
  assert.throws(() => parseStoriesAuthoringProfileBundle(overridden), /шрифтов/);
});
test('applying profile pins preserves draft identity and authored content', () => {
  const original = draft(); const next = applyStoriesAuthoringProfile(original, fixture());
  assert.deepEqual(next.slides, original.slides);
  assert.equal(next.id, original.id);
  assert.equal(original.styleProfile, undefined);
  assert.deepEqual(next.styleProfile, { profileId: 'reverie-default', revisionId: 'reverie-default-r1' });
  assert.doesNotThrow(() => assertStoriesDraftFitsHost(next, fixture()));
});
test('unsupported business buttons are caught before saving the draft', () => {
  const document = draft(); document.slides[0].layers.push({ id: 'actions', kind: 'actions', arrangement: 'vertical', layout: { region: 'bottom', order: 1, alignment: 'start' }, actions: [{ businessActionId: 'payment.unknown', label: 'Кнопка', emphasis: 'primary' }] });
  assert.throws(() => assertStoriesDraftFitsHost(document, fixture()), /кнопок/);
});
