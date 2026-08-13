'use client';

import { ImageViewer } from '@/features/graph-node/ui/image-viewer';
import { AssistantFloatingButton } from '@/shared/ui/assistant-floating-button';
import { ContextMenu } from '@/shared/ui/context-menu';
import { AssistantShell } from '@/widgets/assistant-shell/ui/assistant-shell';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CANVAS_WORLD_SIZE, useProductionCanvasModel } from '../model/use-production-canvas-model';
import { CanvasEdges } from './canvas-edges';
import { CanvasGrid } from './canvas-grid';
import { CanvasNodeLayer } from './canvas-node-layer';
import { CanvasSectionLayer } from './canvas-section-layer';
import { CanvasToolbar } from './canvas-toolbar';
import { DocumentNodePalette } from './document-node-palette';
import { DocumentTitleBar } from './document-title-bar';
import { OpenRouterBalance } from './openrouter-balance';

interface ProductionCanvasProps {
  projectId?: string;
}

export function ProductionCanvas({ projectId }: ProductionCanvasProps) {
  const model = useProductionCanvasModel({ projectId });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const autoOpenedProjectRef = useRef<string | undefined>(undefined);
  const projectTitle = model.documentName
    ?? (model.documentSync.phase === 'loading' ? 'Загрузка документа…' : 'Untitled Pipeline');
  const syncProblem = model.documentSync.phase === 'conflict'
    || model.documentSync.phase === 'error'
    || model.documentSync.phase === 'recovery';

  useEffect(() => {
    if (!projectId
      || !model.workspaceId
      || model.documentSync.phase !== 'saved'
      || model.nodes.length !== 0
      || autoOpenedProjectRef.current === projectId) return;
    autoOpenedProjectRef.current = projectId;
    setAssistantOpen(true);
  }, [model.documentSync.phase, model.nodes.length, model.workspaceId, projectId]);

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
        <DocumentTitleBar
          favorite={model.documentFavorite}
          onCreateSnapshot={model.createDocumentThumbnail}
          onCloseCanvasMenu={model.closeContextMenu}
          onExportProject={model.exportProjectSnapshot}
          onMoveToTrash={model.moveDocumentToTrash}
          onNotify={model.showToast}
          onRename={model.renameDocument}
          onToggleFavorite={model.setDocumentFavorite}
          snapshotMode={model.documentThumbnailMode}
          snapshotPending={model.documentThumbnailPending}
          title={projectTitle}
        />
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
            sectionPublications={model.sectionPublications}
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
        <OpenRouterBalance workspaceId={model.workspaceId} />
        <button
          type="button"
          className={`document-floating-action document-floating-action-add ${paletteOpen ? 'document-floating-action-hidden' : ''}`}
          data-snapshot-exclude
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
        <AssistantShell
          open={assistantOpen}
          contextLabel={projectTitle}
          documentId={projectId}
          documentRevision={model.documentRevision === undefined
            ? undefined
            : model.documentSync.phase === 'saved'
              ? String(model.documentRevision)
              : `unsaved:${model.documentRevision}`}
          onClose={() => setAssistantOpen(false)}
          onPipelineChanged={model.reloadDocumentFromServer}
          route={projectId ? `/projects/${projectId}` : '/projects'}
          selectionIds={[...model.selectedSet, ...model.selectedSectionSet]}
          workspaceId={model.workspaceId}
        />
        {syncProblem && model.documentSync.message ? (
          <div className="canvas-toast" data-snapshot-exclude role="status">{model.documentSync.message}</div>
        ) : model.toastMessage ? <div className="canvas-toast" data-snapshot-exclude>{model.toastMessage}</div> : null}
        {model.boxSelection.rectStyle ? <div className="selection-rect" data-snapshot-exclude style={model.boxSelection.rectStyle} /> : null}
        {model.sectionDraftStyle ? <div className="section-draft-rect" data-snapshot-exclude style={model.sectionDraftStyle} /> : null}
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
