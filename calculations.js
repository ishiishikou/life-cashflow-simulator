export const SCENARIOS = ['low', 'base', 'high'];

export function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function monthlyMortgagePayment(principal, annualRatePercent, years) {
  const p = Math.max(0, clampNumber(principal));
  const n = Math.max(1, Math.round(clampNumber(years, 35) * 12));
  const monthlyRate = Math.max(0, clampNumber(annualRatePercent)) / 100 / 12;
  if (p === 0) return 0;
  if (monthlyRate === 0) return p / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return (p * monthlyRate * factor) / (factor - 1);
}

export function scenarioValue(field, scenario = 'base') {
  if (field == null) return 0;
  if (typeof field === 'number') return field;
  if (typeof field === 'string') return clampNumber(field);
  return clampNumber(field[scenario] ?? field.base ?? 0);
}

export function buildScenarioInput(state, scenario) {
  const a = state.assumptions;
  return {
    scenario,
    currentAssets: scenarioValue(a.currentAssets, scenario),
    monthlyIncome: scenarioValue(a.monthlyIncome, scenario),
    monthlyLivingCost: scenarioValue(a.monthlyLivingCost, scenario),
    currentLoanBalance: scenarioValue(a.currentLoanBalance, scenario),
    salePrice: scenarioValue(a.salePrice, scenario),
    saleCostRate: scenarioValue(a.saleCostRate, scenario),
    movingCost: scenarioValue(a.movingCost, scenario),
    newHomeCost: scenarioValue(a.newHomeCost, scenario),
    cashContribution: scenarioValue(a.cashContribution, scenario),
    mortgageRate: scenarioValue(a.mortgageRate, scenario),
    loanYears: scenarioValue(a.loanYears, scenario),
    simulationYears: Math.max(5, Math.round(scenarioValue(a.simulationYears, scenario))),
    yearsUntilRetirement: Math.max(0, Math.round(scenarioValue(a.yearsUntilRetirement, scenario))),
    monthlyPension: scenarioValue(a.monthlyPension, scenario),
    incomeGrowthRate: scenarioValue(a.incomeGrowthRate, scenario),
    inflationRate: scenarioValue(a.inflationRate, scenario),
    assetReturnRate: scenarioValue(a.assetReturnRate, scenario),
    annualMaintenance: scenarioValue(a.annualMaintenance, scenario),
    cashBufferMonths: scenarioValue(a.cashBufferMonths, scenario),
  };
}

function annualEventCost(events, year, inflationRate) {
  return (events || []).reduce((sum, event) => {
    const start = Math.max(0, Math.round(clampNumber(event.startYear)));
    const duration = Math.max(1, Math.round(clampNumber(event.duration, 1)));
    if (year < start || year >= start + duration) return sum;
    const amount = Math.max(0, clampNumber(event.annualAmount));
    const inflationAdjusted = event.inflationLinked === false
      ? amount
      : amount * Math.pow(1 + inflationRate / 100, year);
    return sum + inflationAdjusted;
  }, 0);
}

export function simulateScenario(state, scenario = 'base', overrides = {}) {
  const input = { ...buildScenarioInput(state, scenario), ...overrides };
  const saleCosts = input.salePrice * input.saleCostRate / 100 + input.movingCost;
  const netSaleProceeds = input.salePrice - input.currentLoanBalance - saleCosts;
  const loanPrincipal = Math.max(0, input.newHomeCost - input.cashContribution);
  const monthlyMortgage = monthlyMortgagePayment(loanPrincipal, input.mortgageRate, input.loanYears);
  const initialAssets = input.currentAssets + netSaleProceeds - input.cashContribution;

  let assets = initialAssets;
  let minAssets = assets;
  let minYear = 0;
  let firstNegativeYear = null;
  let cumulativeIncome = 0;
  let cumulativeOutflow = 0;
  const points = [{ year: 0, assets, income: 0, outflow: 0, eventCost: 0 }];

  for (let year = 1; year <= input.simulationYears; year += 1) {
    const working = year <= input.yearsUntilRetirement;
    const income = working
      ? input.monthlyIncome * 12 * Math.pow(1 + input.incomeGrowthRate / 100, year - 1)
      : input.monthlyPension * 12;
    const living = input.monthlyLivingCost * 12 * Math.pow(1 + input.inflationRate / 100, year - 1);
    const mortgage = year <= input.loanYears ? monthlyMortgage * 12 : 0;
    const maintenance = input.annualMaintenance * Math.pow(1 + input.inflationRate / 100, year - 1);
    const eventCost = annualEventCost(state.events, year, input.inflationRate);
    const outflow = living + mortgage + maintenance + eventCost;

    assets = assets * (1 + input.assetReturnRate / 100) + income - outflow;
    cumulativeIncome += income;
    cumulativeOutflow += outflow;

    if (assets < minAssets) {
      minAssets = assets;
      minYear = year;
    }
    if (firstNegativeYear == null && assets < 0) firstNegativeYear = year;
    points.push({ year, assets, income, outflow, eventCost });
  }

  const bufferTarget = input.monthlyLivingCost * input.cashBufferMonths;
  const debtServiceRatio = input.monthlyIncome > 0 ? monthlyMortgage / input.monthlyIncome : Infinity;
  let status = 'safe';
  if (firstNegativeYear != null) status = 'danger';
  else if (minAssets < bufferTarget || debtServiceRatio > 0.35) status = 'caution';

  return {
    scenario,
    input,
    status,
    points,
    initialAssets,
    finalAssets: assets,
    minAssets,
    minYear,
    firstNegativeYear,
    netSaleProceeds,
    saleCosts,
    loanPrincipal,
    monthlyMortgage,
    debtServiceRatio,
    bufferTarget,
    cumulativeIncome,
    cumulativeOutflow,
  };
}

export function evaluateAllScenarios(state) {
  return Object.fromEntries(SCENARIOS.map((scenario) => [scenario, simulateScenario(state, scenario)]));
}

export function calculateConfidence(state) {
  const weightedFields = [
    ['currentAssets', 12], ['monthlyIncome', 12], ['monthlyLivingCost', 16],
    ['currentLoanBalance', 10], ['salePrice', 10], ['newHomeCost', 12],
    ['mortgageRate', 8], ['yearsUntilRetirement', 6], ['monthlyPension', 6],
    ['annualMaintenance', 4], ['assetReturnRate', 4],
  ];
  const sourceScores = {
    actual: 1,
    contract: 1,
    user_plan: 0.8,
    public_reference: 0.65,
    temporary_assumption: 0.4,
  };
  let score = 0;
  let total = 0;
  for (const [key, weight] of weightedFields) {
    total += weight;
    const field = state.assumptions[key];
    const hasBase = Number.isFinite(Number(field?.base));
    const sourceScore = sourceScores[field?.source] ?? 0.35;
    score += weight * (hasBase ? sourceScore : 0);
  }
  return Math.round((score / total) * 100);
}

export function rankSensitivity(state, baseResult) {
  const baseFinal = baseResult.finalAssets;
  const candidates = [
    {
      key: 'monthlyLivingCost',
      label: '毎月の基本生活費',
      impact: Math.abs(simulateScenario(state, 'base', {
        monthlyLivingCost: baseResult.input.monthlyLivingCost + 10000,
      }).finalAssets - baseFinal),
      condition: '+1万円/月',
    },
    {
      key: 'monthlyIncome',
      label: '毎月の手取り収入',
      impact: Math.abs(simulateScenario(state, 'base', {
        monthlyIncome: Math.max(0, baseResult.input.monthlyIncome - 10000),
      }).finalAssets - baseFinal),
      condition: '-1万円/月',
    },
    {
      key: 'newHomeCost',
      label: '新居総額',
      impact: Math.abs(simulateScenario(state, 'base', {
        newHomeCost: baseResult.input.newHomeCost + 1000000,
      }).finalAssets - baseFinal),
      condition: '+100万円',
    },
    {
      key: 'mortgageRate',
      label: '住宅ローン金利',
      impact: Math.abs(simulateScenario(state, 'base', {
        mortgageRate: baseResult.input.mortgageRate + 0.5,
      }).finalAssets - baseFinal),
      condition: '+0.5ポイント',
    },
    {
      key: 'salePrice',
      label: '現在家の売却価格',
      impact: Math.abs(simulateScenario(state, 'base', {
        salePrice: Math.max(0, baseResult.input.salePrice - 1000000),
      }).finalAssets - baseFinal),
      condition: '-100万円',
    },
  ];
  return candidates.sort((a, b) => b.impact - a.impact).slice(0, 3);
}

export function correctionOptions(state, baseResult) {
  const options = [
    {
      label: '新居総額を300万円下げる',
      result: simulateScenario(state, 'base', {
        newHomeCost: Math.max(0, baseResult.input.newHomeCost - 3000000),
      }),
    },
    {
      label: '基本生活費を月3万円下げる',
      result: simulateScenario(state, 'base', {
        monthlyLivingCost: Math.max(0, baseResult.input.monthlyLivingCost - 30000),
      }),
    },
    {
      label: '借入金利を0.5ポイント下げる',
      result: simulateScenario(state, 'base', {
        mortgageRate: Math.max(0, baseResult.input.mortgageRate - 0.5),
      }),
    },
  ];
  return options.map((option) => ({
    ...option,
    minAssetImprovement: option.result.minAssets - baseResult.minAssets,
    finalAssetImprovement: option.result.finalAssets - baseResult.finalAssets,
  })).sort((a, b) => b.minAssetImprovement - a.minAssetImprovement);
}

export function formatYen(value, compact = false) {
  const n = clampNumber(value);
  if (compact) {
    const man = n / 10000;
    if (Math.abs(man) >= 10000) return `${(man / 10000).toFixed(1)}億円`;
    return `${Math.round(man).toLocaleString('ja-JP')}万円`;
  }
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}
