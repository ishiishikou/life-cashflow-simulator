import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyForwardCsv } from '../csv.js';

test('parses quoted Japanese CSV and excludes transfers', () => {
  const csv = `日付,内容,金額（円）,大項目,振替\n2026/01/01,"給与,本体",500000,収入,0\n2026/01/02,食費,-10000,食費,0\n2026/01/03,口座移動,-50000,振替,1\n2026/02/01,給与,500000,収入,0\n2026/02/02,光熱費,-20000,水道光熱費,0\n`;
  const result = parseMoneyForwardCsv(csv);
  assert.equal(result.months.length, 2);
  assert.equal(result.excludedTransfers, 1);
  assert.equal(result.medianMonthlyIncome, 500000);
  assert.equal(result.medianMonthlyExpense, 15000);
});

test('supports separate income and expense columns', () => {
  const csv = `日付,内容,支出,収入,大項目\n2026-01-01,給与,,400000,収入\n2026-01-02,食費,20000,,食費\n`;
  const result = parseMoneyForwardCsv(csv);
  assert.equal(result.months[0].income, 400000);
  assert.equal(result.months[0].expense, 20000);
});
