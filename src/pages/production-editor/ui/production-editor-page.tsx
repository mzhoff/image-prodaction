import { ProductionCanvas } from '@/widgets/production-canvas/ui/production-canvas';
import { AuthPanel } from '@/features/auth/ui/auth-panel';

export function ProductionEditorPage() {
  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-brand">
          <span className="editor-brand-mark">R</span>
          <div>
            <h1>Reverie Image Production</h1>
            <p>Node-based image pipeline prototype</p>
          </div>
        </div>
        <div className="editor-status">
          <span>Local graph</span>
          <strong>IndexedDB assets</strong>
        </div>
        <AuthPanel />
      </header>
      <ProductionCanvas />
    </main>
  );
}
