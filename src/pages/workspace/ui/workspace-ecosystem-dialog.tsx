'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowUpRight, GraduationCap, X } from '@prodactionpro/ui-core/icons';
import { ReverieLogo } from '@/shared/ui/reverie-logo';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { AnchoredNavigationDialog } from './anchored-navigation-dialog';
import { NavigationIcon } from './navigation-icon';
import { WorkspaceMenuSelect } from './workspace-menu-select';
import { useWorkspaceSearchDialog } from './workspace-search-provider';
import { WorkspaceCreateForm } from './workspace-create-form';

export function WorkspaceEcosystemDialog({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { text } = useInterfaceLocale();
  const openSearch = useWorkspaceSearchDialog();
  const [creating, setCreating] = useState(false);
  const workspaceControl = useRef<HTMLDivElement>(null);
  const cancelCreate = () => {
    setCreating(false);
    workspaceControl.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };
  const products = [
    { id: 'production', name: 'Production', description: text('Визуальное производство', 'Visual production'), href: '/', current: true, image: '/home/create-flow-glass.webp' },
    { id: 'content-hub', name: 'Content Hub', description: text('Контент и публикации', 'Content and publishing'), href: process.env.NEXT_PUBLIC_CONTENT_HUB_URL, image: '/brand/content-hub-glass-c.webp' },
    { id: 'reverie-ai', name: 'Reverie AI', description: text('Идеи и диалоги с AI', 'Ideas and AI conversations'), href: process.env.NEXT_PUBLIC_REVERIE_AI_URL, image: '/brand/reverie-ai-glass-r.webp' },
    { id: 'academy', name: text('Академия', 'Academy'), description: text('Знания и обучение', 'Knowledge and learning'), href: process.env.NEXT_PUBLIC_ACADEMY_URL },
  ];

  return <AnchoredNavigationDialog anchor={anchor} placement="top" width={560} outset={8} label={text('Продукты и пространства Reverie', 'Reverie products and workspaces')}
    className="production-ecosystem-dialog" onClose={onClose}>
    <div className="production-ecosystem-content">
      <header><ReverieLogo className="production-ecosystem-logo" />
        <div className="production-ecosystem-header-actions">
          <button type="button" className="production-small-button" aria-label={text('Поиск в Workspace', 'Search Workspace')} title={text('Поиск', 'Search')} aria-haspopup="dialog"
            onClick={() => { onClose(); openSearch(); }}><NavigationIcon name="search" /></button>
          <button type="button" className="production-small-button" onClick={onClose} aria-label={text('Закрыть окно экосистемы', 'Close ecosystem')}><X size={18} /></button>
        </div>
      </header>
      <div className="production-ecosystem-workspace" ref={workspaceControl}>
        <WorkspaceMenuSelect onClose={onClose} onCreate={() => setCreating(true)} />
      </div>
      {creating ? <WorkspaceCreateForm onCancel={cancelCreate} onCreated={onClose} /> :
      <section className="production-ecosystem-products"><h2>{text('Продукты', 'Products')}</h2><nav aria-label={text('Продукты экосистемы', 'Ecosystem products')}>
        {products.map((product) => {
          const content = <>
            <span className="production-ecosystem-mark" data-product={product.id} aria-hidden="true">
              {product.image ? <Image src={product.image} alt="" width={96} height={96} sizes="96px" draggable={false} /> : <GraduationCap size={34} strokeWidth={1.25} />}
            </span>
            <span className="production-ecosystem-product-copy"><strong>{product.name}</strong><small>{product.description}</small>
              <em data-current={product.current || undefined}>{product.current ? <><span className="production-ecosystem-current-dot" />{text('Вы здесь', 'Current')}</>
                : !product.href ? text('Скоро', 'Coming soon') : <>{text('Открыть', 'Open')}<ArrowUpRight size={12} /></>}</em>
            </span>
          </>;
          return product.current ? <Link href="/" onClick={onClose} key={product.id} aria-current="true">{content}</Link>
            : product.href ? <a key={product.id} href={product.href}>{content}</a>
              : <div className="production-ecosystem-unavailable" key={product.id} aria-disabled="true">{content}</div>;
        })}
      </nav></section>}
    </div>
  </AnchoredNavigationDialog>;
}
