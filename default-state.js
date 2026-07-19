const field = (low, base, high, source = 'temporary_assumption') => ({ low, base, high, source });

export const DEFAULT_STATE = {
  version: 1,
  profileName: '住み替え案A',
  assumptions: {
    currentAssets: field(15000000, 18000000, 20000000, 'user_plan'),
    monthlyIncome: field(680000, 750000, 820000, 'actual'),
    monthlyLivingCost: field(300000, 350000, 400000, 'temporary_assumption'),
    currentLoanBalance: field(45000000, 45000000, 45000000, 'contract'),
    salePrice: field(43800000, 46000000, 48000000, 'user_plan'),
    saleCostRate: field(4, 4, 4, 'public_reference'),
    movingCost: field(1000000, 1500000, 2000000, 'temporary_assumption'),
    newHomeCost: field(75000000, 78000000, 80000000, 'user_plan'),
    cashContribution: field(0, 0, 0, 'user_plan'),
    mortgageRate: field(1.0, 1.8, 3.0, 'temporary_assumption'),
    loanYears: field(35, 35, 35, 'user_plan'),
    simulationYears: field(40, 40, 40, 'user_plan'),
    yearsUntilRetirement: field(22, 22, 22, 'user_plan'),
    monthlyPension: field(250000, 300000, 330000, 'temporary_assumption'),
    incomeGrowthRate: field(1.0, 0.5, 0, 'temporary_assumption'),
    inflationRate: field(1.0, 2.0, 3.0, 'temporary_assumption'),
    assetReturnRate: field(3.0, 1.5, 0, 'temporary_assumption'),
    annualMaintenance: field(300000, 500000, 800000, 'temporary_assumption'),
    cashBufferMonths: field(6, 12, 18, 'user_plan'),
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

export function mergeWithDefaults(saved) {
  if (!saved) return structuredClone(DEFAULT_STATE);
  return {
    ...structuredClone(DEFAULT_STATE),
    ...saved,
    assumptions: { ...structuredClone(DEFAULT_STATE.assumptions), ...(saved.assumptions || {}) },
    events: Array.isArray(saved.events) ? saved.events : structuredClone(DEFAULT_STATE.events),
    snapshots: Array.isArray(saved.snapshots) ? saved.snapshots : [],
    ui: { ...DEFAULT_STATE.ui, ...(saved.ui || {}) },
  };
}
