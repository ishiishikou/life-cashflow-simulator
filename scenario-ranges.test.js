import test from 'node:test';
import assert from 'node:assert/strict';
import { generateScenarioValues } from './scenario-ranges.js';
import { mergeWithDefaults } from './default-state.js';

test('income scenarios move in favorable and unfavorable directions', () => {
  assert.deepEqual(generateScenarioValues('monthlyIncome', 750000), {
    low: 825000,
    base: 750000,
    high: 675000,
  });
});

test('living cost scenarios reverse the numeric direction', () => {
  assert.deepEqual(generateScenarioValues('monthlyLivingCost', 350000), {
    low: 315000,
    base: 350000,
    high: 385000,
  });
});

test('known current values remain fixed across scenarios', () => {
  assert.deepEqual(generateScenarioValues('currentAssets', 18000000), {
    low: 18000000,
    base: 18000000,
    high: 18000000,
  });
});

test('mortgage rate uses an asymmetric stress range', () => {
  assert.deepEqual(generateScenarioValues('mortgageRate', 1.8), {
    low: 1.3,
    base: 1.8,
    high: 2.8,
  });
});

test('untouched version-1 sample values are corrected during migration', () => {
  const migrated = mergeWithDefaults({
    version: 1,
    assumptions: {
      monthlyIncome: { low: 680000, base: 750000, high: 820000, source: 'actual' },
    },
    events: [],
    snapshots: [],
    ui: {},
  });
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.assumptions.monthlyIncome, {
    low: 825000,
    base: 750000,
    high: 675000,
    source: 'actual',
  });
});

test('user-edited version-1 scenario values are preserved', () => {
  const migrated = mergeWithDefaults({
    version: 1,
    assumptions: {
      monthlyIncome: { low: 800000, base: 740000, high: 650000, source: 'user_plan' },
    },
    events: [],
    snapshots: [],
    ui: {},
  });
  assert.deepEqual(migrated.assumptions.monthlyIncome, {
    low: 800000,
    base: 740000,
    high: 650000,
    source: 'user_plan',
  });
});
