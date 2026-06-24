import type { LiquidProfile } from './types';

export const liquidPresets: LiquidProfile[] = [
  {
    id: 'water-20c',
    name: 'Water at 20 C',
    densityKgM3: 998.2,
    note: 'Reference density for mass conversion only; not a custody-transfer correction.',
  },
  {
    id: 'diesel',
    name: 'Diesel fuel',
    densityKgM3: 832,
    note: 'Typical density. Replace with measured batch density for traceable results.',
  },
  {
    id: 'gasoline',
    name: 'Gasoline',
    densityKgM3: 745,
    note: 'Typical density. Replace with measured batch density for traceable results.',
  },
  {
    id: 'crude-oil',
    name: 'Crude oil',
    densityKgM3: 860,
    note: 'Typical density. Replace with lab or custody-transfer density.',
  },
  {
    id: 'ethanol',
    name: 'Ethanol',
    densityKgM3: 789,
    note: 'Approximate density at 20 C.',
  },
  {
    id: 'glycerin',
    name: 'Glycerin',
    densityKgM3: 1260,
    note: 'Approximate density at 20 C.',
  },
  {
    id: 'hydraulic-oil',
    name: 'Hydraulic oil',
    densityKgM3: 870,
    note: 'Typical density. Replace with product data sheet value.',
  },
  {
    id: 'milk',
    name: 'Milk',
    densityKgM3: 1030,
    note: 'Typical density. Replace with measured value for production use.',
  },
];

export const customLiquid = (densityKgM3: number): LiquidProfile => ({
  id: 'custom',
  name: 'Custom liquid',
  densityKgM3,
  note: 'User-supplied density. Mass = observed volume x density.',
});
