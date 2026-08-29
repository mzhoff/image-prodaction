'use client';

import type { ComponentProps } from 'react';
import { PipelineBoundaryNode } from './pipeline-boundary-node';

type PipelineOutputNodeProps = Omit<ComponentProps<typeof PipelineBoundaryNode>, 'portSide'>;

export function PipelineOutputNode(props: PipelineOutputNodeProps) {
  return <PipelineBoundaryNode {...props} portSide="input" />;
}
