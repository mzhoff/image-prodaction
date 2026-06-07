'use client';

import { ImageUp, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { cn } from '@/shared/lib/cn';
import { ImageViewer } from './image-viewer';
import type { MaskEditPayload } from './image-viewer-types';

export interface SubjectProfileReferenceSlot {
  assetId?: string;
  id: string;
  label: string;
}

export function SubjectProfileReferenceGrid({
  canGenerate,
  busy,
  generating,
  generatingReferenceSlotId,
  hasGeneratedReferences,
  onMaskEdit,
  onGenerate,
  onRegenerateSlot,
  sourceModel,
  slots,
}: {
  canGenerate: boolean;
  busy?: boolean;
  generating: boolean;
  generatingReferenceSlotId?: string;
  hasGeneratedReferences: boolean;
  onMaskEdit?: (slotId: string, payload: MaskEditPayload) => Promise<void>;
  onGenerate: () => void;
  onRegenerateSlot: (slotId: string) => void;
  sourceModel?: string;
  slots: SubjectProfileReferenceSlot[];
}) {
  const [viewerSlotId, setViewerSlotId] = useState<string | null>(null);
  const viewerSlots = useMemo(() => slots.filter((slot) => Boolean(slot.assetId)), [slots]);
  const viewerIndex = getViewerIndex(viewerSlots, viewerSlotId);
  const viewerSlot = viewerIndex >= 0 ? viewerSlots[viewerIndex] : undefined;
  const viewerAssetId = viewerSlot?.assetId;
  const viewerAsset = useProductionGraphStore((state) => state.assets.find((asset) => asset.id === viewerAssetId));
  const viewerUrl = useAssetUrl(viewerAssetId);
  const hasViewerHistory = viewerSlots.length > 1;
  const selectViewerVersion = (index: number) => {
    const nextSlot = viewerSlots[getWrappedIndex(index, viewerSlots.length)];
    if (nextSlot) setViewerSlotId(nextSlot.id);
  };

  return (
    <>
      <div className="subject-profile-reference-grid" aria-label="Generated subject references" data-node-interactive>
        <div className="subject-profile-reference-cells">
          {slots.map((slot) => (
            <SubjectProfileReferenceCell
              key={slot.id}
              canRegenerate={canGenerate}
              generating={generatingReferenceSlotId === slot.id}
              generatingAny={generating}
              onOpen={setViewerSlotId}
              onRegenerate={onRegenerateSlot}
              slot={slot}
            />
          ))}
        </div>
        {!hasGeneratedReferences ? <div className="subject-profile-reference-overlay">
          <button
            type="button"
            className="subject-profile-reference-generate"
            onClick={(event) => {
              event.stopPropagation();
              onGenerate();
            }}
            disabled={!canGenerate}
            data-node-interactive
          >
            {generating ? <Loader2 size={15} className="node-button-spinner" /> : <Sparkles size={15} />}
            {generating ? 'Generating...' : 'Generate by refs'}
          </button>
        </div> : null}
      </div>
      {viewerSlot && viewerAssetId && viewerUrl ? createPortal(
        <ImageViewer
          asset={viewerAsset}
          assetId={viewerAssetId}
          busy={busy || generating}
          currentIndex={viewerIndex}
          hasHistory={hasViewerHistory}
          historyAssetIds={viewerSlots.map((slot) => slot.assetId).filter((assetId): assetId is string => Boolean(assetId))}
          onClose={() => setViewerSlotId(null)}
          onMaskEdit={onMaskEdit ? (payload) => onMaskEdit(viewerSlot.id, payload) : undefined}
          onNext={() => selectViewerVersion(viewerIndex + 1)}
          onPrevious={() => selectViewerVersion(viewerIndex - 1)}
          onSelectVersion={selectViewerVersion}
          sourceModel={sourceModel}
          url={viewerUrl}
        />,
        document.body,
      ) : null}
    </>
  );
}

function SubjectProfileReferenceCell({
  canRegenerate,
  generating,
  generatingAny,
  onOpen,
  onRegenerate,
  slot,
}: {
  canRegenerate: boolean;
  generating: boolean;
  generatingAny: boolean;
  onOpen: (slotId: string) => void;
  onRegenerate: (slotId: string) => void;
  slot: SubjectProfileReferenceSlot;
}) {
  const url = useAssetUrl(slot.assetId);
  const handleOpen = () => {
    if (!url) return;
    onOpen(slot.id);
  };

  return (
    <div
      className={cn('subject-profile-reference-cell', url && 'subject-profile-reference-cell-filled')}
      onClick={(event) => {
        event.stopPropagation();
        handleOpen();
      }}
      onKeyDown={(event) => {
        if (!url || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        event.stopPropagation();
        handleOpen();
      }}
      role={url ? 'button' : undefined}
      tabIndex={url ? 0 : undefined}
      title={url ? `Open ${slot.label}` : undefined}
      data-node-interactive
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={slot.label} draggable={false} />
          <button
            type="button"
            className="subject-profile-reference-cell-regenerate"
            onClick={(event) => {
              event.stopPropagation();
              onRegenerate(slot.id);
            }}
            disabled={!canRegenerate || (generatingAny && !generating)}
            title={`Regenerate ${slot.label}`}
            data-node-interactive
          >
            {generating ? <Loader2 size={14} className="node-button-spinner" /> : <Sparkles size={14} />}
          </button>
          <span>{slot.label}</span>
        </>
      ) : (
        <div className="subject-profile-reference-empty">
          <ImageUp size={15} />
          <span>{slot.label}</span>
        </div>
      )}
    </div>
  );
}

function getViewerIndex(slots: SubjectProfileReferenceSlot[], slotId: string | null) {
  if (!slotId || slots.length === 0) return -1;
  return slots.findIndex((slot) => slot.id === slotId);
}

function getWrappedIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return (index + length) % length;
}
