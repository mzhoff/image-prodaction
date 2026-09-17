import { validateStoryHostProfileV3, type StoryHostProfileV3 } from '@prodaction/stories-platform-contracts/host-profile/3.0.0';
import { validateStoryStyleProfileV1, type StoryStyleProfileV1 } from '@prodaction/stories-platform-contracts/style-profile/1.0.0';
import type { StoryDocumentDraftV1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';

/** Portable editor configuration exported by Content Hub; never a runtime credential. */
export interface StoriesAuthoringProfileBundle {
  schemaVersion: 'stories.authoring-profile-bundle@1';
  hostProfile: StoryHostProfileV3;
  styleProfile: StoryStyleProfileV1;
}

export function parseStoriesAuthoringProfileBundle(value: unknown): StoriesAuthoringProfileBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Выберите файл стиля приложения, сохранённый в Content Hub.');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 'stories.authoring-profile-bundle@1'
    || Object.keys(record).some((key) => !['schemaVersion', 'hostProfile', 'styleProfile'].includes(key))) {
    throw new Error('Этот формат стиля не поддерживается. Сохраните стиль приложения заново в Content Hub.');
  }
  const host = validateStoryHostProfileV3(record.hostProfile);
  const style = validateStoryStyleProfileV1(record.styleProfile);
  if (!host.valid && host.issues.some((issue) => issue.code === 'profile.font_not_allowed')) throw new Error('Один из шрифтов недоступен в приложении. Проверьте стиль в Content Hub.');
  if (!host.valid || !style.valid) throw new Error('В файле не хватает настроек приложения или стиля. Сохраните его заново в Content Hub.');
  if (!host.data.allowedStyleProfileIds.includes(style.data.profileId)
    || !host.data.allowedBaseProfileKeys.includes(style.data.baseProfileKey)) {
    throw new Error('Этот стиль не разрешён для выбранного приложения.');
  }
  for (const tokens of [style.data.tokens, host.data.styleOverrides]) {
    if (Object.values(tokens?.typography ?? {}).some((role) => role.fontFamilyAlias && !host.data.allowedFontFamilyAliases.includes(role.fontFamilyAlias))) {
      throw new Error('Один из шрифтов недоступен в приложении. Проверьте стиль в Content Hub.');
    }
  }
  return { schemaVersion: 'stories.authoring-profile-bundle@1', hostProfile: host.data, styleProfile: style.data };
}

export function applyStoriesAuthoringProfile(document: StoryDocumentDraftV1, bundle: StoriesAuthoringProfileBundle): StoryDocumentDraftV1 {
  return { ...structuredClone(document), styleProfile: { profileId: bundle.styleProfile.profileId, revisionId: bundle.styleProfile.revisionId } };
}

/** Drafts may be incomplete; these checks explain application-specific restrictions early. */
export function assertStoriesDraftFitsHost(document: StoryDocumentDraftV1, bundle: StoriesAuthoringProfileBundle): void {
  const host = bundle.hostProfile;
  for (const slide of document.slides) {
    if (slide.background && !host.allowedMediaKinds.includes(slide.background.asset.kind)) throw new Error('Этот фон не поддерживается приложением. Выберите другой тип файла.');
    for (const layer of slide.layers) {
      if (!host.allowedLayerKinds.includes(layer.kind)) throw new Error('Один из блоков не поддерживается приложением. Удалите его перед сохранением.');
      if (layer.kind === 'actions' && layer.actions.some((action) => !host.allowedBusinessActionIds.includes(action.businessActionId))) throw new Error('Одна из кнопок недоступна в приложении. Выберите разрешённое действие.');
      if (layer.kind === 'poll' && !host.allowedPollModes.includes(layer.definition.selectionMode)) throw new Error('Выберите режим опроса, который поддерживается приложением.');
    }
  }
}

export function getStoriesAuthoringActions(bundle: StoriesAuthoringProfileBundle) {
  const labels: Readonly<Record<string, string>> = { 'support.open': 'Поддержка' };
  return bundle.hostProfile.allowedBusinessActionIds.map((id) => ({ id, label: labels[id] ?? 'Действие приложения' }));
}
