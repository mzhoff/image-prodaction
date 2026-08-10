'use client';

import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { useTelegramPublicationNodeModel } from '../../model/use-telegram-publication-node-model';
import { TelegramPublicationDeliveryModal } from '../telegram-publication-delivery-modal';
import { PublicationTabs, TelegramPublicationHeader, type PublicationView } from '../telegram-publication-header';
import { TelegramCollapsedInputPortRail } from '../telegram-publication-media-inputs';
import { TelegramPublicationInputView } from './telegram-publication-input-view';
import { TelegramPublicationResultView } from './telegram-publication-result-view';

interface TelegramPublicationNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TelegramPublicationNode({ node, onStartConnection }: TelegramPublicationNodeProps) {
  const model = useTelegramPublicationNodeModel(node);
  const renameNode = useProductionGraphStore((state) => state.renameNode);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [activeView, setActiveView] = useState<PublicationView>('input');
  const [imagesOpen, setImagesOpen] = useState(true);
  const [textOpen, setTextOpen] = useState(true);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const canPublish = model.messageText.trim().length > 0 || model.imageInputs.length > 0;

  return (
    <>
      <TelegramPublicationHeader
        collapsed={collapsed}
        title={model.data.title}
        onRename={renameNode.bind(null, node.id)}
        contentUnitId={model.data.contentUnitId}
        onCollapsedChange={setCollapsed}
      />
      {collapsed ? <TelegramCollapsedInputPortRail
        bodyConnected={model.textCount > 0}
        connectedMediaPortIds={model.connectedMediaPortIds}
        mediaSlotPortIds={model.mediaSlotPortIds}
        nodeId={node.id}
        onStartConnection={onStartConnection}
        mode="collapsed"
      /> : null}
      {!collapsed ? <>
        <PublicationTabs activeView={activeView} onViewChange={setActiveView} />
        {activeView === 'input' ? <TelegramPublicationInputView
          imagesOpen={imagesOpen}
          model={model}
          nodeId={node.id}
          onImagesOpenChange={setImagesOpen}
          onStartConnection={onStartConnection}
          onTextOpenChange={setTextOpen}
          textOpen={textOpen}
        /> : <TelegramPublicationResultView
          model={model}
          nodeId={node.id}
          onStartConnection={onStartConnection}
          canPublish={canPublish}
          onPublish={() => setDeliveryOpen(true)}
        />}
        {model.data.message ? <div className="node-note node-note-compact publication-node-message">{model.data.message}</div> : null}
        {deliveryOpen ? <TelegramPublicationDeliveryModal
          mediaItems={model.imageInputs}
          messageCharacterLimit={model.telegramCharacterLimit}
          messageLength={model.telegramMessageLength}
          messageRichText={model.messageRichText}
          messageText={model.messageText}
          onClose={() => setDeliveryOpen(false)}
          open={deliveryOpen}
        /> : null}
      </> : null}
    </>
  );
}
