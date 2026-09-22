'use client';
import { useTranslations } from '@/shared/i18n/use-translations';


import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { ProductionHomePage } from '@/pages/workspace/ui/production-home-page';
import { StoryHomePage } from '@/pages/stories/ui/story-home-page';
import { TimelineCreation } from './timeline-creation';
import { newStoryDocument } from '@/pages/stories/model/new-document';
import { FlowCreation } from './flow-creation';
import styles from './production-create.module.css';

export function ProductionCreatePage() {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell(), params = useSearchParams();
  const type = params?.get('type') ?? 'image'; const id = params?.get('document');
  if (type === 'image' || type === 'video' || type === 'text') return <ProductionHomePage createMode={type} />;
  if (type !== 'storyboard' && type !== 'timeline' && type !== 'flow') return <div className={styles.invalid}><h1>{tUi("Что создадим?")}</h1><Link href="/">{tUi("Выбрать на Home")}</Link></div>;
  const workspaceId = workspace.activeWorkspace?.id;
  if (workspaceId && type === 'flow') return <FlowCreation key={`${workspaceId}:${params?.get('folderId') ?? ''}`} workspaceId={workspaceId} />;
  if (workspaceId && type === 'timeline') return <TimelineCreation key={`${workspaceId}:${id || params?.get('preset') ? 'editor' : 'chooser'}`} workspaceId={workspaceId} />;
  return workspaceId ? <StoryboardCreation key={`${workspaceId}:${params?.get('new') ?? ''}`} workspaceId={workspaceId} documentId={id ?? undefined} folderId={params?.get('folderId') ?? null} />
    : <p className="production-home-loading" role="status">{workspace.error || tUi("Загружаю пространство…")}</p>;
}

function StoryboardCreation({ workspaceId, documentId, folderId }: { workspaceId: string; documentId?: string; folderId: string | null }) {
  const [draft] = useState(() => newStoryDocument(workspaceId, folderId));
  return <StoryHomePage documentId={documentId ?? draft.id} initial={documentId ? undefined : draft} />;
}
