'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { AssistantModelSelector } from './assistant-model-selector';
import { ProductionTextComposer } from './production-text-composer';
import { useStoryAuthoring } from './story-authoring-provider';
import { StoryQuestionPanel } from './story-question';
import { StoryCharacterFocus, StoryCharacterStartPanel, StoryCharactersInvitation, StoryCharactersButton } from './story-character-chat';

export function StoryChatComposer(props: Parameters<typeof ProductionTextComposer>[0]) {
  const tUi = useTranslations();
  const authoring = useStoryAuthoring();
  return <div className="story-composer-container">
    <StoryCharactersInvitation compact /><StoryCharacterFocus />
    {authoring.error ? <p className="story-authoring-error" role="alert">{typeof (authoring.error) === 'string' ? tUi((authoring.error) as string) : (authoring.error)}<button type="button" disabled={authoring.busy} onClick={authoring.retry}>{tUi("Повторить проверку")}</button></p> : null}
    <div className="story-composer-anchor"><StoryCharacterStartPanel /><StoryQuestionPanel />
      <ProductionTextComposer {...props} subjectControl={<StoryCharactersButton />} onCancel={() => { authoring.stop(); props.onCancel(); }} saving={props.saving || authoring.busy} parameters={
        <AssistantModelSelector model={props.model} label={tUi("Модель соавтора")} disabled={authoring.busy || props.saving} />
      } />
    </div>
  </div>;
}
