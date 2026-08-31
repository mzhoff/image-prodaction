import type { ProductionNodeType } from './types';

export type ProductionNodeAvailability = 'addable' | 'hidden-incomplete';

export type ProductionNodeExecution = 'server' | 'boundary' | 'transparent' | 'canvas-only';

export interface ProductionNodeHelp {
  aliases: readonly string[];
  availability: ProductionNodeAvailability;
  capabilities: readonly string[];
  execution: ProductionNodeExecution;
  limitations: readonly string[];
  portRules: readonly string[];
  summary: string;
}

export type ProductionNodeHelpMap<TType extends ProductionNodeType> = Record<
  TType,
  ProductionNodeHelp
>;
