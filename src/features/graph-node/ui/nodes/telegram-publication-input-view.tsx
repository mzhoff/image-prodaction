'use client';

import { SearchCheck, Type } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { TELEGRAM_MAX_MEDIA_ITEMS } from '../../lib/telegram-media-layout';
import type { useTelegramPublicationNodeModel } from '../../model/use-telegram-publication-node-model';
import { PortButton } from '../port-button';
import { TelegramMessageEditor } from '../telegram-message-editor';
import { PublicationActionButton, PublicationInputSection } from '../telegram-publication-controls';
import { PublicationInputMediaGrid, TelegramMediaInputPorts } from '../telegram-publication-media-inputs';

interface Props {
  imagesOpen: boolean;
  model: ReturnType<typeof useTelegramPublicationNodeModel>;
  nodeId: string;
  onImagesOpenChange: (isOpen: boolean) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTextOpenChange: (isOpen: boolean) => void;
  textOpen: boolean;
}

export function TelegramPublicationInputView(props: Props) {
  const { imagesOpen, model, nodeId, onImagesOpenChange, onStartConnection, onTextOpenChange, textOpen } = props;
  return (
    <div className="publication-node-panel publication-node-input-panel">
      <PublicationInputSection
        countLabel={`${Math.min(model.imageCount, TELEGRAM_MAX_MEDIA_ITEMS)}/${TELEGRAM_MAX_MEDIA_ITEMS}`}
        headerPort={!imagesOpen ? <TelegramMediaInputPorts
          collapsed
          connectedMediaPortIds={model.connectedMediaPortIds}
          mediaSlotPortIds={model.mediaSlotPortIds}
          nodeId={nodeId}
          onStartConnection={onStartConnection}
        /> : null}
        isOpen={imagesOpen}
        kind="image"
        label="Images"
        onOpenChange={onImagesOpenChange}
      >
        <TelegramMediaInputPorts
          connectedMediaPortIds={model.connectedMediaPortIds}
          mediaSlotPortIds={model.mediaSlotPortIds}
          nodeId={nodeId}
          onStartConnection={onStartConnection}
        />
        <PublicationInputMediaGrid items={model.previewMediaItems} onRemove={model.handleMediaRemove} onReorder={model.handleMediaReorder} />
      </PublicationInputSection>
      <PublicationInputSection
        countLabel={model.textCount > 0 ? `${model.textCount} text` : ''}
        headerPort={!textOpen ? <PortButton
          nodeId={nodeId}
          portId="body"
          side="input"
          kind="text"
          label="Text blocks"
          className="publication-section-header-port"
          connectionState={model.textCount > 0 ? 'text' : undefined}
          onStartConnection={onStartConnection}
        /> : null}
        isOpen={textOpen}
        kind="text"
        label="Text"
        onOpenChange={onTextOpenChange}
      >
        <PortButton
          nodeId={nodeId}
          portId="body"
          side="input"
          kind="text"
          label="Text blocks"
          className="publication-section-body-port"
          connectionState={model.textCount > 0 ? 'text' : undefined}
          onStartConnection={onStartConnection}
        />
        <TelegramMessageEditor richText={model.messageRichText} characterLimit={model.telegramCharacterLimit} value={model.messageText} onChange={model.handleMessageTextChange} />
      </PublicationInputSection>
      <PublicationActionButton
        disabled={model.formatDisabled}
        icon={<Type size={18} />}
        label="Formate Text"
        nodeId={nodeId}
        onClick={model.handleFormatMessage}
        onStartConnection={onStartConnection}
        portId="formatRules"
        portLabel="Format rules"
      />
      <PublicationActionButton
        icon={<SearchCheck size={18} />}
        label="Check"
        nodeId={nodeId}
        onStartConnection={onStartConnection}
        portId="checkRules"
        portLabel="Check rules"
      />
    </div>
  );
}
