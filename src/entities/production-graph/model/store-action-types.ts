import type { ProductionGraphState } from './store-types';

export type StoreSet = (
  partial:
    | Partial<ProductionGraphState>
    | ProductionGraphState
    | ((state: ProductionGraphState) => Partial<ProductionGraphState> | ProductionGraphState),
  replace?: false,
) => void;

export type StoreGet = () => ProductionGraphState;
