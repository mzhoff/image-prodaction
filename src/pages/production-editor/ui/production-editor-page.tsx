import { ProductionCanvas } from '@/widgets/production-canvas/ui/production-canvas';
import { PipelineSwitcher } from '@/widgets/production-canvas/ui/pipeline-switcher';
import { PipelineSyncStatus } from '@/widgets/production-canvas/ui/pipeline-sync-status';
import { AuthPanel } from '@/features/auth/ui/auth-panel';
import { PipelineRouteGate } from './pipeline-route-gate';

export function ProductionEditorPage() {
  return (
    <PipelineRouteGate>
      <main className="editor-page">
        <header className="editor-header">
          <div className="editor-brand">
            <span className="editor-brand-mark">R</span>
            <div>
              <h1>Reverie Image Production</h1>
              <p>Node-based image pipeline prototype</p>
            </div>
          </div>
          <div className="editor-header-actions">
            <PipelineSwitcher />
            <PipelineSyncStatus />
            <AuthPanel />
          </div>
        </header>
        <ProductionCanvas />
      </main>
    </PipelineRouteGate>
  );
}
