'use client';

import { createContext, useContext } from 'react';
import { HelpCircle } from '@prodactionpro/ui-core/icons';
import { ProTooltip } from './pro-tooltip';
import './section-help.css';

export interface SectionHelpApi {
  section: string | null;
  owner: string;
  label: string;
  open: (section?: string) => void;
}

export const SectionHelpContext = createContext<SectionHelpApi | null>(null);

/** Shared entry point; the host owns scenarios, routing and first-visit policy. */
export function SectionHelpButton({ section, label }: { section?: string; label?: string }) {
  const help = useContext(SectionHelpContext);
  const id = section ?? help?.section;
  if (!help || !id) return null;
  const title = label ?? help.label;
  return <ProTooltip label={title} side="bottom"><button type="button" className="section-tool-button section-help-button" data-section-help={id} data-section-help-owner={help.owner}
    aria-label={title} aria-haspopup="dialog" onClick={() => help.open(id)}><HelpCircle size={18} /></button></ProTooltip>;
}
