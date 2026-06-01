'use client';

import { ContextMenu } from '@/shared/ui/context-menu';
import { CANVAS_WORLD_SIZE, useProductionCanvasModel } from '../model/use-production-canvas-model';
import { CanvasEdges } from './canvas-edges';
import { CanvasGrid } from './canvas-grid';
import { CanvasNodeLayer } from './canvas-node-layer';
import { CanvasSectionLayer } from './canvas-section-layer';
import { CanvasToolbar } from './canvas-toolbar';
import { OpenRouterBalance } from './openrouter-balance';

export function ProductionCanvas() {
  const model = useProductionCanvasModel();

  return (
    <div className="canvas-shell">
      <CanvasToolbar
        activeTool={model.canvasTool}
        canRedo={model.historyFutureLength > 0}
        canUndo={model.historyPastLength > 0}
        onExportPipelineTemplate={model.exportPipelineTemplate}
        onExportProject={model.exportProjectSnapshot}
        onImportPipelineTemplate={model.importPipelineTemplateFile}
        onImportProject={model.importProjectSnapshotFile}
        onDeleteSelected={model.deleteSelected}
        onRedo={model.redo}
        onSelectTool={model.setCanvasTool}
        onUndo={model.undo}
        onZoomToFit={() => model.canvas.zoomToBounds(model.bounds)}
      />
      <div
        ref={model.canvas.containerRef}
        className={`production-canvas ${model.connectionDraft ? 'production-canvas-connecting' : ''}`}
        onMouseDown={model.handleCanvasMouseDown}
        onMouseMove={model.handleCanvasMouseMove}
        onDragOver={model.handleCanvasDragOver}
        onDrop={model.handleCanvasDrop}
        onContextMenu={model.openCanvasMenu}
        style={{ cursor: model.cursor }}
      >
        <CanvasGrid pan={model.canvas.pan} zoom={model.canvas.zoom} />
        <div
          className="canvas-world"
          style={{
            width: CANVAS_WORLD_SIZE,
            height: CANVAS_WORLD_SIZE,
            transform: `translate(${model.canvas.pan.x}px, ${model.canvas.pan.y}px) scale(${model.canvas.zoom})`,
          }}
        >
          <CanvasSectionLayer
            disabled={model.canvasTool === 'section'}
            onRenameSection={model.renameSection}
            onSelectSection={model.selectSection}
            onStartDrag={model.startSectionDrag}
            onStartResize={model.startSectionResize}
            sections={model.sections}
            selectedSectionSet={model.selectedSectionSet}
          />
          <CanvasEdges
            collapsedGenerateComposingNodeIds={model.collapsedGenerateComposingNodeIds}
            connectionDraft={model.connectionDraft}
            edges={model.edges}
            measuredPortPoints={model.measuredPortPoints}
            nodesById={model.nodesById}
            worldSize={CANVAS_WORLD_SIZE}
          />
          <CanvasNodeLayer
            collapsedGenerateComposingNodeIds={model.collapsedGenerateComposingNodeIds}
            nodes={model.nodes}
            onGenerateComposingOpenChange={model.toggleGenerateComposing}
            onNodeContextMenu={model.openNodeMenu}
            onStartConnection={model.startConnection}
            onStartDrag={model.startNodeDrag}
            selectedSet={model.selectedSet}
          />
        </div>
        <div className="zoom-indicator">{Math.round(model.canvas.zoom * 100)}%</div>
        <OpenRouterBalance />
        {model.toastMessage ? <div className="canvas-toast">{model.toastMessage}</div> : null}
        {model.boxSelection.rectStyle ? <div className="selection-rect" style={model.boxSelection.rectStyle} /> : null}
        {model.sectionDraftStyle ? <div className="section-draft-rect" style={model.sectionDraftStyle} /> : null}
        <ContextMenu menu={model.contextMenu.menu} onClose={model.closeContextMenu} />
      </div>
    </div>
  );
}
