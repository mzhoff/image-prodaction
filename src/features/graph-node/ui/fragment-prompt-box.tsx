'use client';

import type { ComponentProps } from 'react';
import { PromptBox } from '@/shared/ui/prompt-box';
import { TextSectionFilterTags } from './text-section-filter-tags';

/** Одна и та же строка бейджей всегда перед редактируемым/вычисляемым текстом. */
export function FragmentPromptBox(props: ComponentProps<typeof PromptBox>) {
  return <>
    <TextSectionFilterTags textField={props.textField} text={props.value} readOnly={props.readonly}
      className="text-fragment-field-tags" />
    <PromptBox {...props} />
  </>;
}
