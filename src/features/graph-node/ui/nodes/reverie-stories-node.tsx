'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { Button } from '@prodactionpro/ui-core/button';
import { Loader2, Maximize2, RefreshCw, Upload } from '@prodactionpro/ui-core/icons';
import { countStoryTextCharacters, STORY_CONTENT_LIMITS_V1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import type { EditorMedia, StoryDocumentDraftV1 } from '@prodactionpro/ui-stories-editor';
import { getActiveAssetScope, type ActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { parseStoriesAuthoringProfileBundle } from '@/shared/contracts/stories-authoring-profile';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, ReverieStoriesNodeData } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { SettingRow } from '@/shared/ui/setting-row';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { useReverieStoriesNodeModel } from '../../model/use-reverie-stories-node-model';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';
import { ReverieStoriesEditor } from '../reverie-stories-editor';
import './reverie-stories-node.css';

interface Props { node: ProductionNode; onStartConnection: (nodeId: string, portId: string, event: PointerEvent<HTMLButtonElement>) => void }

export function ReverieStoriesNode({ node, onStartConnection }: Props) {
  const model = useReverieStoriesNodeModel(node);
  const { isCollapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [editor, setEditor] = useState<{ document: StoryDocumentDraftV1; media: EditorMedia[]; scope: ActiveAssetScope }>();
  const [profileError, setProfileError] = useState('');
  const profileInput = useRef<HTMLInputElement>(null);
  const ports = getNodePorts(node);
  const sequence = model.data.storyMode === 'sequence';
  const open = async (fromInputs = false) => {
    const prepared = await model.prepareDocument(fromInputs);
    if (prepared) setEditor(prepared);
  };
  const copy = (field: 'storyTitle' | 'subtitle' | 'text', label: string, connected: string, limit: number) => {
    const hasConnection = model.isConnected(field === 'storyTitle' ? 'title' : field);
    const value = hasConnection ? connected : model.data[field];
    const count = countStoryTextCharacters(value);
    const hintId = `${node.id}-${field}-hint`;
    return <div className="reverie-stories-node-field" key={field}>
      <textarea aria-label={label} aria-describedby={hintId} className={`prompt-box reverie-stories-node-input${field === 'text' ? ' reverie-stories-node-input-body' : ''}`} rows={field === 'text' ? 3 : 2} value={value} readOnly={hasConnection || Boolean(node.locked)} aria-invalid={count > limit}
        onChange={(event) => model.updateData({ [field]: event.target.value })} />
      <small id={hintId} className={`reverie-stories-node-field-hint${count > limit ? ' reverie-stories-node-error' : ''}`} role={count > limit ? 'alert' : undefined}>{count > limit ? `Сократите текст на ${count - limit} симв. — он не поместится в Stories.` : `${count} / ${limit}${hasConnection ? ' · Из входа' : ''}`}</small>
    </div>;
  };
  const renderPort = (port: (typeof ports)[number]) => <PortButton nodeId={node.id} portId={port.id} side={port.side} kind={port.kind} label={port.label}
    className="node-port-section" onStartConnection={onStartConnection} />;
  return <>
    <NodeTitle title={model.data.title} nodeType="reverieStories" muted action={<TextNodeTitleActions collapsed={isCollapsed} count={model.data.document ? String(model.data.document.slides.length) : undefined} onCollapsedChange={setCollapsed} />} />
    {isCollapsed ? ports.map((port) => <div key={port.id} className="reverie-stories-node-collapsed-port"><span>{port.label}</span><PortButton nodeId={node.id} portId={port.id} side={port.side} kind={port.kind} label={port.label} onStartConnection={onStartConnection} style={{ top: 12 }} /></div>) : <>
      <fieldset className="reverie-stories-node-settings" disabled={node.locked} aria-label="Настройки Stories" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
        <SettingRow label="Режим" value={model.data.storyMode ?? 'slide'} options={[{ value: 'slide', label: 'Слайд' }, { value: 'sequence', label: 'Собрать историю' }]}
          onChange={(value) => { if (!node.locked) model.updateData({ storyMode: value as ReverieStoriesNodeData['storyMode'] }); }} wide />
        <input ref={profileInput} type="file" accept="application/json,.json" hidden aria-label="Файл стиля приложения" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file || node.locked) return;
          const scope = getActiveAssetScope();
          try {
            if (file.size > 256 * 1024) throw new Error('Файл слишком большой. Выберите сохранённый стиль приложения.');
            const value: unknown = JSON.parse(await file.text());
            const active = getActiveAssetScope();
            if (active?.documentId !== scope?.documentId || active?.workspaceId !== scope?.workspaceId) throw new Error('Документ изменился. Загрузите стиль заново.');
            model.importAuthoringProfile(parseStoriesAuthoringProfileBundle(value)); setProfileError('');
          } catch (error) { setProfileError(error instanceof SyntaxError ? 'Не удалось прочитать стиль. Выберите файл из Content Hub.' : error instanceof Error ? error.message : 'Не удалось загрузить стиль.'); }
        }} />
        <Button type="button" intent="neutral" appearance="outline" size="md" leadingIcon={<Upload size={15} />} className="secondary-node-button" disabled={node.locked} onClick={() => profileInput.current?.click()}>Загрузить стиль приложения</Button>
        {model.data.authoringProfileBundle ? <p className="reverie-stories-node-hint">Стиль: {model.data.authoringProfileBundle.styleProfile.name}</p> : <p className="reverie-stories-node-hint">Сохраните стиль приложения в Content Hub и загрузите сюда для точного предпросмотра.</p>}
        {profileError ? <p className="reverie-stories-node-hint reverie-stories-node-error" role="alert">{profileError}</p> : null}
        <p className="node-note reverie-stories-node-hint">{sequence ? 'Подключите готовые слайды по порядку. Они станут одной историей.' : 'Тексты и фон образуют слайд. Объедините несколько таких нод в историю.'}</p>
      </fieldset>
      {ports.filter((port) => port.side === 'input').map((port) => <CollapsibleSection key={port.id} title={port.label} className="text-node-section" sidePort={renderPort(port)} dropTarget={{ nodeId: node.id, portId: port.id }}>
        <div className="reverie-stories-node-section" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
          {!sequence && port.id === 'title' ? copy('storyTitle', 'Заголовок', model.connectedTitle, STORY_CONTENT_LIMITS_V1.title) : null}
          {!sequence && port.id === 'subtitle' ? copy('subtitle', 'Подзаголовок', model.connectedSubtitle, STORY_CONTENT_LIMITS_V1.subtitle) : null}
          {!sequence && port.id === 'text' ? copy('text', 'Текст', model.connectedText, STORY_CONTENT_LIMITS_V1.text) : null}
          {port.id === 'image' ? <p className="reverie-stories-node-hint">{model.image?.name ?? 'Изображение из библиотеки'}</p> : null}
          {port.id === 'video' ? <p className="reverie-stories-node-hint">{model.video?.name ?? 'Видео MP4 H.264'}</p> : null}
          {port.id === 'poster' ? <p className="reverie-stories-node-hint">{model.poster?.name ?? 'Обложка на случай недоступности видео'}</p> : null}
          {port.id === 'poll' ? <p className="reverie-stories-node-hint">Вопрос и варианты ответа</p> : null}
          {port.id.startsWith('document') ? <p className="reverie-stories-node-hint">Готовые слайды из предыдущего шага</p> : null}
        </div>
      </CollapsibleSection>)}
      {ports.filter((port) => port.side === 'output').map((port) => <CollapsibleSection key={port.id} title="Stories" className="text-node-section" sidePort={renderPort(port)}>
        <div className="reverie-stories-node-section reverie-stories-node-actions" data-node-interactive onPointerDown={(event) => event.stopPropagation()} aria-busy={model.preparing}>
          <p className="reverie-stories-node-hint">{model.data.document ? `В черновике слайдов: ${model.data.document.slides.length}` : 'Откройте редактор, чтобы проверить структуру, фон и текст.'}</p>
          <PrimaryActionButton disabled={model.preparing || node.locked} icon={model.preparing ? <Loader2 size={15} className="node-button-spinner" /> : <Maximize2 size={15} />} onClick={() => void open()}>{model.preparing ? 'Подготовка…' : 'Открыть редактор'}</PrimaryActionButton>
          {model.data.document ? <Button type="button" intent="neutral" appearance="outline" size="md" leadingIcon={<RefreshCw size={15} />} className="secondary-node-button" disabled={model.preparing || node.locked} onClick={() => void open(true)}>Собрать заново из входов</Button> : null}
          {model.message ? <p className="node-note reverie-stories-node-hint reverie-stories-node-error" role="alert">{model.message}</p> : null}
        </div>
      </CollapsibleSection>)}
    </>}
    {editor ? <ReverieStoriesEditor initialDocument={editor.document} media={editor.media} fromConnectedRecipe={model.hasInputs} authoringProfileBundle={model.data.authoringProfileBundle} onClose={() => setEditor(undefined)} onSave={(document) => { model.saveDocument(document, editor.scope); setEditor(undefined); }} /> : null}
  </>;
}
