import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyMortgagePayment, simulateScenario } from '../calculations.js';

const field = (value) => ({ low: value, base: value, high: value, source: 'actual' });

function baseState() {
  return {
    assumptions: {
      currentAssets: field(10000000),
      monthlyIncome: field(600000),
      monthlyLivingCost: field(250000),
      currentLoanBalance: field(0),
      salePrice: field(0),
      saleCostRate: field(0),
      movingCost: field(0),
      newHomeCost: field(30000000),
      cashContribution: field(0),
      mortgageRate: field(1),
      loanYears: field(35),
      simulationYears: field(10),
      yearsUntilRetirement: field(10),
      monthlyPension: field(0),
      incomeGrowthRate: field(0),
      inflationRate: field(0),
      assetReturnRate: field(0),
      annualMaintenance: field(0),
      cashBufferMonths: field(6),
    },
    events: [],
  };
}

test('zero-interest mortgage divides principal by months', () => {
  assert.equal(monthlyMortgagePayment(12000000, 0, 10), 100000);
});

test('standard mortgage payment is within expected range', () => {
  const payment = monthlyMortgagePayment(30000000, 1, 35);
  assert.ok(payment > 84000 && payment < 85000);
});

test('scenario tracks initial assets and remains positive in affordable case', () => {
  const result = simulateScenario(baseState(), 'base');
  assert.equal(result.initialAssets, 10000000);
  assert.equal(result.status, 'safe');
  assert.equal(result.firstNegativeYear, null);
});

test('large recurring event can make scenario dangerous', () => {
  const state = baseState();
  state.events.push({ startYear: 1, duration: 10, annualAmount: 10000000, inflationLinked: false });
  const result = simulateScenario(state, 'base');
  assert.equal(result.status, 'danger');
  assert.ok(result.firstNegativeYear >= 1);
});
