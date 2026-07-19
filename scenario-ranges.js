// The stored keys are historical: low = optimistic, base = standard, high = cautious.
// Values are generated in the direction that is favorable or unfavorable to the household,
// rather than merely sorting them by numeric size.
const RULES = {
  currentAssets: { fixed: true },
  monthlyIncome: { optimisticFactor: 1.10, cautiousFactor: 0.90, round: 1000 },
  monthlyLivingCost: { optimisticFactor: 0.90, cautiousFactor: 1.10, round: 1000 },
  yearsUntilRetirement: { fixed: true },
  monthlyPension: { optimisticFactor: 1.10, cautiousFactor: 0.90, round: 1000 },
  currentLoanBalance: { fixed: true },
  salePrice: { optimisticFactor: 1.05, cautiousFactor: 0.95, round: 10000 },
  saleCostRate: { optimisticOffset: -0.5, cautiousOffset: 0.5, round: 0.1, min: 0 },
  movingCost: { optimisticFactor: 0.80, cautiousFactor: 1.20, round: 10000 },
  newHomeCost: { optimisticFactor: 0.95, cautiousFactor: 1.05, round: 10000 },
  cashContribution: { fixed: true },
  mortgageRate: { optimisticOffset: -0.5, cautiousOffset: 1.0, round: 0.1, min: 0 },
  loanYears: { fixed: true },
  annualMaintenance: { optimisticFactor: 0.80, cautiousFactor: 1.20, round: 10000 },
  simulationYears: { fixed: true },
  incomeGrowthRate: { optimisticOffset: 0.5, cautiousOffset: -0.5, round: 0.1 },
  inflationRate: { optimisticOffset: -1.0, cautiousOffset: 1.0, round: 0.1, min: 0 },
  assetReturnRate: { optimisticOffset: 1.5, cautiousOffset: -1.5, round: 0.1 },
  cashBufferMonths: { fixed: true },
};

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundTo(value, step = 1) {
  if (!step) return value;
  const precision = step < 1 ? Math.ceil(Math.abs(Math.log10(step))) : 0;
  return Number((Math.round(value / step) * step).toFixed(precision));
}

function applyRule(base, rule, side) {
  if (rule.fixed) return base;
  const factor = rule[`${side}Factor`];
  const offset = rule[`${side}Offset`];
  let value = factor == null ? base : base * factor;
  if (offset != null) value += offset;
  if (rule.min != null) value = Math.max(rule.min, value);
  if (rule.max != null) value = Math.min(rule.max, value);
  return roundTo(value, rule.round);
}

export function generateScenarioValues(key, baseValue) {
  const base = toFiniteNumber(baseValue);
  const rule = RULES[key] || { fixed: true };
  return {
    low: applyRule(base, rule, 'optimistic'),
    base,
    high: applyRule(base, rule, 'cautious'),
  };
}

export function isScenarioRangeFixed(key) {
  return (RULES[key] || { fixed: true }).fixed === true;
}

export function getScenarioRangeDescription(key) {
  const rule = RULES[key] || { fixed: true };
  if (rule.fixed) {
    return '現在値・契約値・本人の計画として扱うため、楽観・標準・慎重の3ケースで同じ値を使います。';
  }
  if (rule.optimisticFactor != null) {
    const optimistic = Math.round(Math.abs(rule.optimisticFactor - 1) * 100);
    const cautious = Math.round(Math.abs(rule.cautiousFactor - 1) * 100);
    return `標準値を基準に、家計に有利な方向へ${optimistic}%、不利な方向へ${cautious}%の幅を自動設定します。`;
  }
  const formatOffset = (value) => `${value >= 0 ? '+' : ''}${value}`;
  return `標準値を基準に、楽観ケースは${formatOffset(rule.optimisticOffset)}、慎重ケースは${formatOffset(rule.cautiousOffset)}の幅を自動設定します。`;
}
