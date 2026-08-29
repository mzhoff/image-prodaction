'use client';

import { Loader2, QrCode } from 'lucide-react';
import type { QrCodeContentMode } from '@/shared/qr-code';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { DarkSelect } from '@/shared/ui/dark-select';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { useQrCodeNodeModel } from '../../model/use-qr-code-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

const contentModeOptions = [
  { value: 'url', label: 'URL' },
  { value: 'text', label: 'Text' },
];

export function QrCodeNode({ node }: { node: ProductionNode }) {
  const model = useQrCodeNodeModel(node);

  return (
    <>
      <NodeTitle title={model.data.title} nodeType={node.type} muted />
      <div className="qr-code-input-block" data-node-interactive>
        <div className="qr-code-input-heading">
          <span>Content</span>
          <DarkSelect
            ariaLabel="QR content mode"
            value={model.options.contentMode}
            options={contentModeOptions}
            onChange={(value) => model.handleModeChange(value as QrCodeContentMode)}
          />
        </div>
        <textarea
          className="qr-code-content-input"
          value={model.data.content ?? ''}
          placeholder={model.options.contentMode === 'url' ? 'https://example.com' : 'Text to encode'}
          aria-label={model.options.contentMode === 'url' ? 'QR URL' : 'QR text'}
          onChange={(event) => model.handleContentChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          spellCheck={false}
        />
        {model.hasIncomingInput ? (
          <div className="qr-code-input-source">
            Connected input{model.incomingInputLabel ? ` · ${model.incomingInputLabel}` : ''} has priority.
          </div>
        ) : null}
        {model.validationMessage ? <div className="qr-code-validation-message">{model.validationMessage}</div> : null}
      </div>
      <ImagePlate assetId={model.data.resultAssetId} aspectRatio="1:1" compact />
      <div className="qr-code-output-contract" aria-label="QR output settings">
        <span>{model.options.outputFormat.toUpperCase()}</span>
        <span>{model.options.pixelSize} × {model.options.pixelSize}</span>
        <span>ECC {model.options.errorCorrectionLevel}</span>
        <span>Margin {model.options.margin}</span>
      </div>
      <PrimaryActionButton
        icon={node.status === 'running' ? <Loader2 className="spin" size={16} /> : <QrCode size={16} />}
        onClick={() => void model.handleGenerate()}
        disabled={node.status === 'running' || !model.effectiveContent || Boolean(model.validationMessage)}
      >
        Generate QR
      </PrimaryActionButton>
      {model.data.message ? <div className="node-note node-note-compact qr-code-message">{model.data.message}</div> : null}
    </>
  );
}
