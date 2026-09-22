'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { SectionHelpButton } from '@/shared/ui/section-help';
import { ProTooltip } from '@/shared/ui/pro-tooltip';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, LibraryBig, Search } from '@prodactionpro/ui-core/icons';
import { HomeTextScenarios } from '@/features/chat-assistant/ui/home-text-scenarios';
import type { HomeComposerMode } from '@/features/chat-assistant/ui/home-composer-mode-switch';
import { HomeProductionChat } from '@/features/chat-assistant/ui/home-production-chat';
import { HomeChatHeaderTarget } from '@/features/chat-assistant/ui/home-chat-header-target';
import { useWorkspaceShell } from './workspace-shell-context';
import { useDocumentReturnHref } from './document-navigation';
import { useWorkspaceSearchDialog } from './workspace-search-provider';

export function ProductionHomePage({ createMode }: { createMode?: HomeComposerMode } = {}) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell(), returnHref = useDocumentReturnHref();
  const openSearch = useWorkspaceSearchDialog();
  const params = useSearchParams();
  const requested = createMode ?? params?.get('create');
  const [headerActions, setHeaderActions] = useState<HTMLDivElement | null>(null);
  const [composer, setComposer] = useState<{ screen?: HomeComposerMode; mode: HomeComposerMode }>({ mode: 'text' });
  const screen = requested === 'image' || requested === 'video' || requested === 'text' ? requested : undefined;
  const composerMode = composer.screen === screen ? composer.mode : screen ?? 'text';
  const onComposerModeChange = (mode: HomeComposerMode) => setComposer({ screen, mode });
  return <HomeChatHeaderTarget.Provider value={headerActions}><div className="production-home" data-mode={screen ?? 'home'}>
    <header className="production-home-header"><div className="home-screen-heading">
      {screen ? <Link className="home-screen-back" href={returnHref} aria-label={tUi("Вернуться к предыдущему экрану")}><ArrowLeft size={18} /></Link> : null}
      <h1>{screen === 'image' ? tUi("Создание изображения") : screen === 'video' ? tUi("Создание видео") : screen === 'text' ? tUi("Диалог") : 'Home'}</h1>
    </div><div className="home-header-actions" data-onboarding-target="home-actions">
      {!screen ? <ProTooltip label={tUi("Поиск в Workspace")} side="bottom"><button className="home-search-button" type="button" aria-label={tUi("Поиск в Workspace")} aria-haspopup="dialog" onClick={() => openSearch({ scope: 'all' })}><Search size={18} /></button></ProTooltip> : null}
      <SectionHelpButton /><Link className="home-library-link" href="/library"><LibraryBig size={16} />{tUi("Моя библиотека")}</Link>
      <div ref={setHeaderActions} /></div></header>
    <section className="production-home-conversation" aria-label={tUi("Быстрое создание")}>
      {workspace.activeWorkspace ? <HomeProductionChat key={workspace.activeWorkspace.id}
        workspaceId={workspace.activeWorkspace.id} screen={screen} composerMode={composerMode} onComposerModeChange={onComposerModeChange}
        welcome={<HomeWelcome onModeChange={onComposerModeChange} />} />
        : <p className="production-home-loading" role="status">{workspace.error || tUi("Загружаю пространство…")}</p>}
    </section>
  </div></HomeChatHeaderTarget.Provider>;
}

function HomeWelcome({ onModeChange }: { onModeChange: (mode: HomeComposerMode) => void }) {
  const tUi = useTranslations();
  const router = useRouter();
  const imageMode = () => router.push('/create?type=image');
  return <div className="production-home-welcome">
    <div className="production-home-heading"><span className="production-home-eyebrow">PRODUCTION</span>
      <h2>{tUi("Что создадим сегодня?")}</h2><p>{tUi("Добавьте референс и опишите идею. Ассистент поможет воплотить её.")}</p></div>
    <div className="production-home-starts">
      <button type="button" className="production-start-card" onClick={imageMode}>
        <span className="production-start-visual"><img src="/home/create-image-glass.webp" alt="" width={512} height={512} decoding="async" draggable={false} /></span>
        <strong>{tUi("Изображение")}</strong><small>{tUi("Из идеи в готовый кадр")}</small></button>
      <Link className="production-start-card" href="/create?type=flow" draggable={false}>
        <span className="production-start-visual"><img src="/home/create-flow-glass.webp" alt="" width={512} height={512} decoding="async" draggable={false} /></span>
        <strong>Flow</strong><small>{tUi("Соберите свой процесс")}</small></Link>
      <Link className="production-start-card" href="/create?type=storyboard" draggable={false}>
        <span className="production-start-visual"><img src="/home/create-storyboard-glass.webp" alt="" width={512} height={512} decoding="async" draggable={false} /></span>
        <strong>Storyboard</strong><small>{tUi("История по кадрам")}</small></Link>
      <Link className="production-start-card" href="/create?type=timeline" draggable={false}>
        <span className="production-start-visual"><img src="/home/create-timeline-glass.webp" alt="" width={512} height={512} decoding="async" draggable={false} /></span>
        <strong>Timeline</strong><small>{tUi("Соберите последовательность")}</small></Link>
    </div>
    <HomeTextScenarios onSelect={() => onModeChange('text')} />
  </div>;
}
