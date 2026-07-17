'use client';

import { ImageViewer } from '@/features/graph-node/ui/image-viewer';
import { AssistantFloatingButton } from '@/shared/ui/assistant-floating-button';
import { ContextMenu } from '@/shared/ui/context-menu';
import { AssistantShell } from '@/widgets/assistant-shell/ui/assistant-shell';
import { Menu, Plus } from 'lucide-react';
import { useState } from 'react';
import { CANVAS_WORLD_SIZE, useProductionCanvasModel } from '../model/use-production-canvas-model';
import { CanvasEdges } from './canvas-edges';
import { CanvasGrid } from './canvas-grid';
import { CanvasNodeLayer } from './canvas-node-layer';
import { CanvasSectionLayer } from './canvas-section-layer';
import { CanvasToolbar } from './canvas-toolbar';
import { DocumentNodePalette } from './document-node-palette';
import { OpenRouterBalance } from './openrouter-balance';

interface ProductionCanvasProps {
  projectId?: string;
}

export function ProductionCanvas({ projectId }: ProductionCanvasProps) {
  const model = useProductionCanvasModel({ projectId });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const projectTitle = model.documentName
    ?? (model.documentSync.phase === 'loading' ? 'Загрузка документа…' : 'Untitled Pipeline');
  const syncProblem = model.documentSync.phase === 'conflict'
    || model.documentSync.phase === 'error'
    || model.documentSync.phase === 'recovery';

  return (
    <div className="canvas-shell">
      <CanvasToolbar
        activeTool={model.canvasTool}
        canRedo={model.historyFutureLength > 0}
        canUndo={model.historyPastLength > 0}
        onExportProject={model.exportProjectSnapshot}
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
        <div className="document-title-pill">
          <button type="button" aria-label="Open document menu">
            <Menu size={16} />
          </button>
          <strong>{projectTitle}</strong>
        </div>
        <DocumentNodePalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onCreateNode={model.createNodeFromPalette}
        />
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
            onSectionContextMenu={model.openSectionMenu}
            onSelectSection={model.selectSection}
            onStartDrag={model.startSectionDrag}
            onStartResize={model.startSectionResize}
            sectionColorPreviews={model.sectionColorPreviews}
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
            onNodeOptionsMenu={model.openNodeOptionsMenu}
            onStartConnection={model.startConnection}
            onStartDrag={model.startNodeDrag}
            selectedSet={model.selectedSet}
          />
        </div>
        <OpenRouterBalance />
        <button
          type="button"
          className={`document-floating-action document-floating-action-add ${paletteOpen ? 'document-floating-action-hidden' : ''}`}
          aria-label="Open node palette"
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(true)}
        >
          <Plus size={28} />
        </button>
        <AssistantFloatingButton
          className={assistantOpen ? 'assistant-floating-button-hidden' : ''}
          onClick={() => setAssistantOpen(true)}
        />
        <AssistantShell open={assistantOpen} contextLabel={projectTitle} onClose={() => setAssistantOpen(false)} />
        {syncProblem && model.documentSync.message ? (
          <div className="canvas-toast" role="status">{model.documentSync.message}</div>
        ) : model.toastMessage ? <div className="canvas-toast">{model.toastMessage}</div> : null}
        {model.boxSelection.rectStyle ? <div className="selection-rect" style={model.boxSelection.rectStyle} /> : null}
        {model.sectionDraftStyle ? <div className="section-draft-rect" style={model.sectionDraftStyle} /> : null}
        <ContextMenu menu={model.contextMenu.menu} onClose={model.closeContextMenu} />
        {model.imageViewer ? (
          <ImageViewer
            asset={model.imageViewer.asset}
            assetId={model.imageViewer.assetId}
            assetMetadata={model.imageViewer.assetMetadata}
            busy={false}
            currentIndex={model.imageViewer.currentIndex}
            hasHistory={model.imageViewer.hasHistory}
            historyAssetIds={model.imageViewer.historyAssetIds}
            onClose={model.imageViewer.onClose}
            onNext={model.imageViewer.onNext}
            onPrevious={model.imageViewer.onPrevious}
            onSaveToLibrary={model.imageViewer.onSaveToLibrary}
            onSelectVersion={model.imageViewer.onSelectVersion}
            savedToLibrary={model.imageViewer.savedToLibrary}
            sourceModel={model.imageViewer.sourceModel}
            url={model.imageViewer.url}
          />
        ) : null}
      </div>
    </div>
  );
}
