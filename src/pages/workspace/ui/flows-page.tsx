import Link from 'next/link';
import { FlaskConical } from '@prodactionpro/ui-core/icons';
import { FlowsNavigation } from './flows-navigation';
import { WorkspacePage } from './workspace-page';

export function FlowsPage({ published = false }: { published?: boolean }) {
  return <WorkspacePage basePath="/flows" section={published ? 'pipelines' : 'my-files'}
    headerEnd={<Link href="/playground" className="studio-button section-accent-button flows-playground-link"><FlaskConical size={17} />Playground</Link>}
    navigation={<FlowsNavigation active={published ? 'published' : 'documents'} />} />;
}
