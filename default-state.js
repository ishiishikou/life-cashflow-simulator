import { generateScenarioValues } from './scenario-ranges.js';

const field = (key, base, source = 'temporary_assumption') => ({
  ...generateScenarioValues(key, base),
  source,
});

const LEGACY_DEFAULTS = {
  currentAssets: [15000000, 18000000, 20000000],
  monthlyIncome: [680000, 750000, 820000],
  monthlyLivingCost: [300000, 350000, 400000],
  currentLoanBalance: [45000000, 45000000, 45000000],
  salePrice: [43800000, 46000000, 48000000],
  saleCostRate: [4, 4, 4],
  movingCost: [1000000, 1500000, 2000000],
  newHomeCost: [75000000, 78000000, 80000000],
  cashContribution: [0, 0, 0],
  mortgageRate: [1.0, 1.8, 3.0],
  loanYears: [35, 35, 35],
  simulationYears: [40, 40, 40],
  yearsUntilRetirement: [22, 22, 22],
  monthlyPension: [250000, 300000, 330000],
  incomeGrowthRate: [1.0, 0.5, 0],
  inflationRate: [1.0, 2.0, 3.0],
  assetReturnRate: [3.0, 1.5, 0],
  annualMaintenance: [300000, 500000, 800000],
  cashBufferMonths: [6, 12, 18],
};

export const DEFAULT_STATE = {
  version: 2,
  profileName: '住み替え案A',
  assumptions: {
    currentAssets: field('currentAssets', 18000000, 'user_plan'),
    monthlyIncome: field('monthlyIncome', 750000, 'actual'),
    monthlyLivingCost: field('monthlyLivingCost', 350000),
    currentLoanBalance: field('currentLoanBalance', 45000000, 'contract'),
    salePrice: field('salePrice', 46000000, 'user_plan'),
    saleCostRate: field('saleCostRate', 4, 'public_reference'),
    movingCost: field('movingCost', 1500000),
    newHomeCost: field('newHomeCost', 78000000, 'user_plan'),
    cashContribution: field('cashContribution', 0, 'user_plan'),
    mortgageRate: field('mortgageRate', 1.8),
    loanYears: field('loanYears', 35, 'user_plan'),
    simulationYears: field('simulationYears', 40, 'user_plan'),
    yearsUntilRetirement: field('yearsUntilRetirement', 22, 'user_plan'),
    monthlyPension: field('monthlyPension', 300000),
    incomeGrowthRate: field('incomeGrowthRate', 0.5),
    inflationRate: field('inflationRate', 2.0),
    assetReturnRate: field('assetReturnRate', 1.5),
    annualMaintenance: field('annualMaintenance', 500000),
    cashBufferMonths: field('cashBufferMonths', 12, 'user_plan'),
  },
  events: [
    { id: crypto.randomUUID(), label: '子ども1：高校・大学費用', startYear: 9, duration: 7, annualAmount: 1300000, inflationLinked: true },
    { id: crypto.randomUUID(), label: '子ども2：高校・大学費用', startYear: 11, duration: 7, annualAmount: 1300000, inflationLinked: true },
    { id: crypto.randomUUID(), label: '子ども3：高校・大学費用', startYear: 11, duration: 7, annualAmount: 1300000, inflationLinked: true },
    { id: crypto.randomUUID(), label: '設備更新・大型修繕', startYear: 15, duration: 1, annualAmount: 3000000, inflationLinked: true },
  ],
  importedSummary: null,
  snapshots: [],
  ui: { activeTab: 'dashboard', selectedScenario: 'base' },
};

function matchesLegacyDefault(key, value) {
  const legacy = LEGACY_DEFAULTS[key];
  if (!legacy || !value) return false;
  return ['low', 'base', 'high'].every((scenario, index) => Number(value[scenario]) === legacy[index]);
}

function mergeAssumptions(saved) {
  const savedAssumptions = saved?.assumptions || {};
  return Object.fromEntries(Object.entries(DEFAULT_STATE.assumptions).map(([key, defaultValue]) => {
    const savedValue = savedAssumptions[key];
    if (!savedValue) return [key, structuredClone(defaultValue)];

    // Only untouched version-1 sample values are corrected automatically.
    // User-edited scenario values remain unchanged.
    if (Number(saved?.version || 1) < 2 && matchesLegacyDefault(key, savedValue)) {
      return [key, { ...structuredClone(defaultValue), source: savedValue.source || defaultValue.source }];
    }

    return [key, { ...structuredClone(defaultValue), ...savedValue }];
  }));
}

export function mergeWithDefaults(saved) {
  if (!saved) return structuredClone(DEFAULT_STATE);
  return {
    ...structuredClone(DEFAULT_STATE),
    ...saved,
    version: DEFAULT_STATE.version,
    assumptions: mergeAssumptions(saved),
    events: Array.isArray(saved.events) ? saved.events : structuredClone(DEFAULT_STATE.events),
    snapshots: Array.isArray(saved.snapshots) ? saved.snapshots : [],
    ui: { ...DEFAULT_STATE.ui, ...(saved.ui || {}) },
  };
}
