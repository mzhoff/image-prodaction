'use client';

import type { ComponentProps } from 'react';
import { PipelineBoundaryNode } from './pipeline-boundary-node';

type PipelineInputNodeProps = Omit<ComponentProps<typeof PipelineBoundaryNode>, 'portSide'>;

export function PipelineInputNode(props: PipelineInputNodeProps) {
  return <PipelineBoundaryNode {...props} portSide="output" />;
}
