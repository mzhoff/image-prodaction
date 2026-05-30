'use client';

import { Eraser, Paintbrush, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { SettingRow } from '@/shared/ui/setting-row';
import { sketchPalette, useSketchNodeModel } from '../../model/use-sketch-node-model';
import { NodeTitle } from '../node-title';
import { SketchCanvas, type SketchCanvasHandle, type SketchTool } from '../sketch-canvas';

export function SketchNode({ node }: { node: ProductionNode }) {
  const model = useSketchNodeModel(node);
  const canvasRef = useRef<SketchCanvasHandle | null>(null);
  const [tool, setTool] = useState<SketchTool>('brush');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const aspectRatioStyle = `${model.canvasSize.width} / ${model.canvasSize.height}`;

  return (
    <>
      <NodeTitle title="Sketch" muted />
      <SketchCanvas
        ref={canvasRef}
        asset={model.asset}
        brushColor={model.brushColor}
        brushSize={model.brushSize}
        height={model.canvasSize.height}
        onCommit={model.saveCanvas}
        style={{ aspectRatio: aspectRatioStyle }}
        tool={tool}
        width={model.canvasSize.width}
      />
      <div className="sketch-toolbar" data-node-interactive>
        <button
          type="button"
          className={`sketch-tool-button ${tool === 'brush' ? 'sketch-tool-button-active' : ''}`}
          onClick={() => setTool('brush')}
          aria-label="Brush"
        >
          <Paintbrush size={14} />
        </button>
        <button
          type="button"
          className={`sketch-tool-button ${tool === 'eraser' ? 'sketch-tool-button-active' : ''}`}
          onClick={() => setTool('eraser')}
          aria-label="Eraser"
        >
          <Eraser size={14} />
        </button>
        <label className="sketch-size-control">
          <span>{model.brushSize}px</span>
          <input
            type="range"
            min="8"
            max="180"
            value={model.brushSize}
            onChange={(event) => model.handleBrushSizeChange(Number(event.target.value))}
          />
        </label>
        <button type="button" className="sketch-tool-button" onClick={() => canvasRef.current?.clear()} aria-label="Clear sketch">
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="sketch-palette" data-node-interactive>
        {sketchPalette.map((color) => (
          <button
            key={color}
            type="button"
            className={`sketch-color-swatch ${model.brushColor.toLowerCase() === color.toLowerCase() ? 'sketch-color-swatch-active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              setTool('brush');
              model.handleBrushColorChange(color);
            }}
            aria-label={`Use color ${color}`}
          />
        ))}
        <label className="sketch-color-picker" aria-label="Custom color">
          <input
            type="color"
            value={model.brushColor}
            onChange={(event) => {
              setTool('brush');
              model.handleBrushColorChange(event.target.value);
            }}
          />
        </label>
      </div>
      <CollapsibleSection title="Settings" open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SettingRow
          label="Aspect Ratio"
          value={model.aspectRatio}
          options={model.aspectRatioOptions}
          onChange={model.handleAspectRatioChange}
        />
      </CollapsibleSection>
    </>
  );
}
