'use client';

import type { MediaViewerModule } from '@prodactionpro/ui-media';
import { Brush, Eraser, Loader2, Mic, RotateCcw, WandSparkles } from '@prodactionpro/ui-core/icons';
import { Slider } from '@prodactionpro/ui-core/slider';
import { cn } from '@/shared/lib/cn';
import { ModelSelector } from '@/features/model-selector/ui/model-selector';
import { ImageMaskEditor } from './image-mask-editor';
import { MAX_MASK_BRUSH_SIZE, MIN_MASK_BRUSH_SIZE, useImageViewerMaskModel } from './use-image-viewer-mask-model';

type MaskModuleOptions = Parameters<typeof useImageViewerMaskModel>[0] & {
  busy?: boolean;
  width: number;
  height: number;
};

/** The drawing canvas, prompt, model selection and paid edit callback belong to IP. */
export function useImageViewerMaskModule({ busy, width, height, ...options }: MaskModuleOptions) {
  const model = useImageViewerMaskModel(options);
  const descriptor: MediaViewerModule | undefined = model.canMaskEdit ? {
    id: 'image-production-mask',
    label: 'Edit',
    active: model.maskOpen,
    placement: 'bottom',
    lockNavigation: model.maskOpen,
    toolbar: <>
      <button type="button" className={cn('image-editor-button', model.maskOpen && 'image-editor-button-active')}
        onClick={() => model.setMaskOpen((open) => !open)}>
        <Brush size={15} />Edit
      </button>
      {model.maskOpen ? <div className="image-editor-mask-tools">
        <div className="image-editor-tool-pair">
          <button type="button" className={cn('image-editor-icon-button', model.visibleTool === 'brush' && 'image-editor-button-active')}
            onClick={() => model.setTool('brush')} aria-label="Brush"><Brush size={15} /></button>
          <button type="button" className={cn('image-editor-icon-button', model.visibleTool === 'eraser' && 'image-editor-button-active')}
            onClick={() => model.setTool('eraser')} aria-label="Eraser"><Eraser size={15} /></button>
        </div>
        <div className="image-editor-size-slider">
          <output className="image-editor-size-value">{model.brushSize}px</output>
          <Slider
            max={MAX_MASK_BRUSH_SIZE}
            min={MIN_MASK_BRUSH_SIZE}
            step={1}
            value={model.brushSize}
            thumbAriaLabel="Mask brush size"
            getValueText={(value) => `${value}px`}
            tooltip={{ formatValue: (value) => `${value}px` }}
            onValueChange={model.setBrushSize}
          />
        </div>
        <button type="button" className="image-editor-icon-button" onClick={() => model.maskRef.current?.clear()} aria-label="Clear mask">
          <RotateCcw size={15} />
        </button>
      </div> : null}
    </>,
    body: model.maskOpen && !model.localMaskMode ? <div className="image-editor-input-area">
      <textarea className="image-editor-prompt" value={model.prompt}
        placeholder="Что необходимо изменить в выделенном фрагменте?"
        onChange={(event) => model.setPrompt(event.target.value)} />
      <div className="image-editor-input-toolbar">
        <ModelSelector modality="image" className="image-editor-model-button" value={model.selectedEditModel} options={model.modelOptions} onChange={model.setEditModel} />
        <div className="image-editor-action-group">
          <button type="button" className="image-editor-mic-button" aria-label="Voice input"><Mic size={20} /></button>
          <button type="button" className="image-editor-submit" onClick={model.handleSubmitEdit} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}ReGenerate
          </button>
        </div>
      </div>
      {model.message ? <span className="image-editor-message">{model.message}</span> : null}
    </div> : null,
    // Keep the canvas mounted when the toolbar closes so a draft mask survives.
    overlay: <ImageMaskEditor ref={model.maskRef} brushSize={model.brushSize}
      enabled={model.maskOpen && !busy} height={height} width={width}
      initialMaskDataUrl={model.maskDataUrl ?? null} onMaskChange={model.onMaskChange}
      onPreviewToolChange={model.setPreviewTool} tool={model.tool} />,
  } : undefined;
  return { module: descriptor, sourceModelLabel: model.sourceModelLabel, imageSizeLabel: model.imageSizeLabel,
    maskOpen: model.maskOpen, localMaskMode: model.localMaskMode };
}
