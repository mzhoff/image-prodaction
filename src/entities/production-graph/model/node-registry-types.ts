import type { GraphPort, ProductionNodeData, ProductionNodeType } from './types';

export interface ProductionNodeDefinition {
  type: ProductionNodeType;
  title: string;
  menuLabel: string;
  defaultHeight: number;
  collapsible?: boolean;
  ports: GraphPort[];
  createData: () => ProductionNodeData;
}

export type ProductionNodeDefinitionMap<TType extends ProductionNodeType> = Record<TType, ProductionNodeDefinition>;
