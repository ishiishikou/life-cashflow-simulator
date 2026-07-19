function parseLine(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function normalize(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s（）()_\-]/g, '');
}

function findColumn(headers, candidates) {
  const normalizedHeaders = headers.map(normalize);
  return normalizedHeaders.findIndex((header) => candidates.some((candidate) => header.includes(normalize(candidate))));
}

function parseAmount(value) {
  const cleaned = String(value ?? '').replace(/[¥￥,\s]/g, '').replace(/円$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/(\d{4})[\/\-.年](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function parseMoneyForwardCsv(text) {
  const rows = parseLine(text);
  if (rows.length < 2) throw new Error('CSVに明細行が見つかりません。');
  const headers = rows[0];
  const dateIndex = findColumn(headers, ['日付', 'date']);
  const amountIndex = findColumn(headers, ['金額円', '金額', 'amount']);
  const expenseIndex = findColumn(headers, ['支出', 'expense']);
  const incomeIndex = findColumn(headers, ['収入', 'income']);
  const categoryIndex = findColumn(headers, ['大項目', 'カテゴリ', '分類', 'category']);
  const transferIndex = findColumn(headers, ['振替', 'transfer']);

  if (dateIndex < 0 || (amountIndex < 0 && expenseIndex < 0 && incomeIndex < 0)) {
    throw new Error('日付列と金額列を判別できませんでした。CSVのヘッダーを確認してください。');
  }

  const monthlyMap = new Map();
  const categoryMap = new Map();
  let accepted = 0;
  let transfers = 0;

  rows.slice(1).forEach((row) => {
    const month = parseDate(row[dateIndex]);
    if (!month) return;
    const transferValue = transferIndex >= 0 ? normalize(row[transferIndex]) : '';
    const category = categoryIndex >= 0 ? String(row[categoryIndex] || '未分類').trim() : '未分類';
    const normalizedCategory = normalize(category);
    const isTransfer = ['1', 'true', 'yes', '対象', '振替'].includes(transferValue) || normalizedCategory.includes('振替');
    if (isTransfer) {
      transfers += 1;
      return;
    }

    let income = 0;
    let expense = 0;
    if (expenseIndex >= 0 || incomeIndex >= 0) {
      expense = Math.abs(parseAmount(row[expenseIndex]));
      income = Math.abs(parseAmount(row[incomeIndex]));
    } else {
      const amount = parseAmount(row[amountIndex]);
      if (amount >= 0) income = amount;
      else expense = Math.abs(amount);
    }
    if (income === 0 && expense === 0) return;

    const current = monthlyMap.get(month) || { month, income: 0, expense: 0, count: 0 };
    current.income += income;
    current.expense += expense;
    current.count += 1;
    monthlyMap.set(month, current);

    const cat = categoryMap.get(category) || { category, income: 0, expense: 0, count: 0 };
    cat.income += income;
    cat.expense += expense;
    cat.count += 1;
    categoryMap.set(category, cat);
    accepted += 1;
  });

  const months = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  if (!months.length) throw new Error('集計できる明細がありませんでした。');
  const categories = [...categoryMap.values()].sort((a, b) => b.expense - a.expense);
  return {
    importedAt: new Date().toISOString(),
    rowCount: accepted,
    excludedTransfers: transfers,
    months,
    categories,
    medianMonthlyIncome: median(months.map((m) => m.income)),
    medianMonthlyExpense: median(months.map((m) => m.expense)),
    averageMonthlyIncome: months.reduce((sum, m) => sum + m.income, 0) / months.length,
    averageMonthlyExpense: months.reduce((sum, m) => sum + m.expense, 0) / months.length,
    latestMonth: months.at(-1)?.month ?? null,
  };
}
