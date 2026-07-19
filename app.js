import {
  calculateConfidence,
  correctionOptions,
  evaluateAllScenarios,
  formatYen,
  rankSensitivity,
} from './calculations.js';
import { parseMoneyForwardCsv } from './csv.js';
import { DEFAULT_STATE, mergeWithDefaults } from './default-state.js';
import { clearState, loadState, saveState } from './storage.js';

const sourceLabels = {
  actual: '実績',
  contract: '契約・見積',
  user_plan: '本人の計画',
  public_reference: '公的参考値',
  temporary_assumption: '仮定値',
};

const fieldGroups = [
  {
    title: '現在の家計',
    description: 'CSVや残高明細から確定しやすい項目です。住宅費と投資を生活費へ二重計上しないようにします。',
    fields: [
      { key: 'currentAssets', label: '現在の金融資産', unit: '円', impact: '高', description: '現金・投資信託・株式など、住み替え時点で利用可能な金融資産。', formula: '金融機関ごとの残高を合計。保険は解約返戻金を使う場合だけ加算。', prompt: '現在の金融資産を、現金・投資・解約可能資産に分けて合計してください。二重計上を確認してください。' },
      { key: 'monthlyIncome', label: '毎月の手取り収入', unit: '円/月', impact: '高', description: '賞与を月割りした世帯手取り。CSV実績から中央値を反映できます。', formula: '(年間手取り給与＋手取り賞与＋継続収入) ÷ 12', prompt: '年間の手取り収入を月平均にしてください。一時金と継続収入を分けてください。' },
      { key: 'monthlyLivingCost', label: '毎月の基本生活費', unit: '円/月', impact: '高', description: '住宅ローン、投資、口座振替、大型臨時支出を除いた継続支出。', formula: '総支出－住宅費－投資－口座振替－一時的支出', prompt: '月次支出から住宅費、投資、口座振替、一時的支出を除き、直近12か月の中央値を計算してください。' },
      { key: 'yearsUntilRetirement', label: '退職までの年数', unit: '年', impact: '中', description: '給与収入から年金収入へ切り替わるまでの年数。', formula: '想定退職年齢－現在年齢', prompt: '現在年齢と想定退職年齢から退職までの年数を計算してください。' },
      { key: 'monthlyPension', label: '退職後の月間年金', unit: '円/月', impact: '中', description: '夫婦合計の手取りに近い概算。税・社会保険を別途精緻化できます。', formula: '夫婦それぞれの年金見込額を合計', prompt: '夫婦のねんきん定期便等から、受給開始年齢と月額を整理し、世帯合計を計算してください。' },
    ],
  },
  {
    title: '現在の家の売却',
    description: '査定額ではなく、ローン返済と売却費用を差し引いた手取りで評価します。',
    fields: [
      { key: 'currentLoanBalance', label: '現在ローン残高', unit: '円', impact: '高', description: '住み替え時点で返済が必要な元本残高。', formula: '金融機関の残高証明または返済予定表を確認', prompt: '住宅ローン返済予定表から、住み替え予定月時点の元本残高を特定してください。' },
      { key: 'salePrice', label: '現在家の売却価格', unit: '円', impact: '高', description: '慎重・標準・楽観の幅を持たせます。査定額をそのまま確定値にしません。', formula: '複数査定の下限・中央値・上限を設定', prompt: '複数の売却査定から、成約可能性を考慮した慎重・標準・楽観の3価格を提案してください。' },
      { key: 'saleCostRate', label: '売却費用率', unit: '%', impact: '中', description: '仲介手数料、登記、契約関連費用などの概算率。実見積で更新します。', formula: '売却価格×費用率。譲渡税は該当時に別イベント化。', prompt: '売却価格に対する仲介・登記・契約費用の概算率を計算し、税金を別枠で示してください。' },
      { key: 'movingCost', label: '引越し・二重費用', unit: '円', impact: '中', description: '引越し、仮住まい、残置物、二重ローン等の一時費用。', formula: '引越し＋仮住まい＋家具家電＋二重負担期間', prompt: '住み替え工程から、引越し・仮住まい・家具家電・二重負担の費用を積み上げてください。' },
    ],
  },
  {
    title: '新居とローン',
    description: '土地・建物だけでなく付帯工事、外構、諸費用、予備費まで総額へ含めます。',
    fields: [
      { key: 'newHomeCost', label: '新居総額', unit: '円', impact: '高', description: '土地、建物、外構、付帯工事、諸費用、予備費の総額。', formula: '土地＋建物＋付帯工事＋外構＋設計申請＋諸費用＋予備費', prompt: '住宅見積を土地・建物・付帯工事・外構・諸費用・未確定費に分解し、総額の下限・標準・上限を計算してください。' },
      { key: 'cashContribution', label: '新居への現金投入', unit: '円', impact: '中', description: '頭金や諸費用として新居へ投入し、金融資産から減る金額。', formula: '自己資金として支払う額。売却手取りとの二重計上に注意。', prompt: '生活防衛資金を残したうえで、新居へ投入可能な自己資金を計算してください。' },
      { key: 'mortgageRate', label: '住宅ローン金利', unit: '%', impact: '高', description: '契約想定と、上昇ストレスを3ケースで登録します。', formula: '変動金利は現在値だけでなく＋1、＋2ポイントも検証', prompt: 'ローン商品の適用金利と優遇条件を整理し、標準・上昇時の3ケースを作ってください。' },
      { key: 'loanYears', label: '返済期間', unit: '年', impact: '中', description: '元利均等返済として月返済を計算します。', formula: '完済年齢も併記して返済期間を決定', prompt: '借入時年齢、完済希望年齢、月返済上限から返済期間候補を比較してください。' },
      { key: 'annualMaintenance', label: '年間修繕・保有費', unit: '円/年', impact: '中', description: '固定資産税、保険、小修繕等の平準化額。大型更新はイベントで追加。', formula: '固定資産税＋保険＋年間小修繕積立', prompt: '新居の固定資産税、保険、小修繕を年額に換算してください。大型設備更新は除外してください。' },
    ],
  },
  {
    title: '長期シナリオ',
    description: '予測値ではなく、耐性を確認するための仮定です。幅を持たせたまま比較します。',
    fields: [
      { key: 'simulationYears', label: 'シミュレーション期間', unit: '年', impact: '低', description: '教育費ピーク、退職、ローン完済まで含む期間。', formula: 'ローン完済または90歳程度までを目安', prompt: '現在年齢、ローン完済年齢、年金期間を踏まえ、必要なシミュレーション年数を提案してください。' },
      { key: 'incomeGrowthRate', label: '収入成長率', unit: '%/年', impact: '中', description: '現役期間中の手取り収入の年成長率。', formula: '昇給率－税・社会保険増を考慮した手取りベース', prompt: '過去の給与実績から手取り収入の年平均成長率を計算し、慎重値も示してください。' },
      { key: 'inflationRate', label: '生活費上昇率', unit: '%/年', impact: '高', description: '生活費と物価連動イベントの上昇率。', formula: '将来予測ではなく1～3%等の耐性比較に使用', prompt: '生活費上昇率を楽観・標準・慎重のストレスケースとして設定してください。' },
      { key: 'assetReturnRate', label: '金融資産の運用率', unit: '%/年', impact: '中', description: '金融資産全体に対する税引後の概算運用率。', formula: '現金比率を含む全金融資産ベース。高すぎる値を避ける。', prompt: '現金と投資資産の配分から、金融資産全体の税引後期待収益率を慎重に計算してください。' },
      { key: 'cashBufferMonths', label: '生活防衛資金', unit: 'か月', impact: '中', description: '最低金融資産の警戒判定に使う生活費月数。', formula: '基本生活費×確保月数', prompt: '雇用安定性、家族人数、住宅保有リスクから必要な生活防衛資金の月数を提案してください。' },
    ],
  },
];

let state;
let results;
let saveTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveState(state), 250);
}

function scenarioLabel(key) {
  return ({ low: '楽観', base: '標準', high: '慎重' })[key];
}

function formatValue(value, unit) {
  if (unit.includes('円')) return formatYen(value, Math.abs(Number(value)) >= 1000000);
  if (unit.includes('%')) return `${Number(value).toLocaleString('ja-JP')}%`;
  return `${Number(value).toLocaleString('ja-JP')}${unit}`;
}

function render() {
  results = evaluateAllScenarios(state);
  renderTabs();
  renderDashboard();
  renderInputs();
  renderActuals();
  renderEvents();
}

function renderTabs() {
  const active = state.ui.activeTab || 'dashboard';
  $$('.tab-button').forEach((button) => button.classList.toggle('active', button.dataset.tab === active));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${active}`));
}

function renderDashboard() {
  const selected = state.ui.selectedScenario || 'base';
  const result = results[selected];
  $$('.scenario-toggle button').forEach((button) => button.classList.toggle('active', button.dataset.scenario === selected));

  const statusCopy = {
    safe: ['安全圏', '設定した生活防衛資金を維持しながら、シミュレーション期間を完走します。', '✓'],
    caution: ['要注意', '標準ケースは継続できますが、最低資産または返済負担に余裕がありません。', '!'],
    danger: ['危険', `${result.firstNegativeYear}年後に金融資産がマイナスへ転じる計算です。条件の見直しが必要です。`, '×'],
  }[result.status];
  const confidence = calculateConfidence(state);
  $('#status-card').className = `status-card ${result.status}`;
  $('#status-card').innerHTML = `
    <div class="status-symbol">${statusCopy[2]}</div>
    <div class="status-copy">
      <p class="eyebrow">${scenarioLabel(selected)}シナリオ</p>
      <h3>住み替え判定：${statusCopy[0]}</h3>
      <p>${statusCopy[1]}</p>
    </div>
    <div class="status-meta"><strong>${confidence}%</strong><span>判定信頼度</span></div>
  `;

  const metrics = [
    ['住み替え直後の資産', formatYen(result.initialAssets, true), `売却手取り ${formatYen(result.netSaleProceeds, true)}`],
    ['最低金融資産', formatYen(result.minAssets, true), `${result.minYear}年後`],
    ['新ローン月返済', formatYen(result.monthlyMortgage, true), `借入 ${formatYen(result.loanPrincipal, true)}`],
    ['最終金融資産', formatYen(result.finalAssets, true), `${result.input.simulationYears}年後`],
  ];
  $('#metric-grid').innerHTML = metrics.map(([label, value, note]) => `
    <div class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>
  `).join('');

  renderChart();

  const sensitivity = rankSensitivity(state, results.base);
  $('#sensitivity-list').innerHTML = sensitivity.map((item, index) => `
    <div class="rank-item">
      <div class="rank-number">${index + 1}</div>
      <div class="rank-copy"><strong>${item.label}</strong><span>${item.condition}の場合</span></div>
      <div class="rank-value"><strong>${formatYen(item.impact, true)}</strong><span>最終資産への影響</span></div>
    </div>
  `).join('');

  const corrections = correctionOptions(state, results.base);
  $('#correction-list').innerHTML = corrections.map((item, index) => `
    <div class="rank-item">
      <div class="rank-number">${index + 1}</div>
      <div class="rank-copy"><strong>${item.label}</strong><span>最低資産の改善</span></div>
      <div class="rank-value"><strong>+${formatYen(item.minAssetImprovement, true)}</strong><span>最終 +${formatYen(item.finalAssetImprovement, true)}</span></div>
    </div>
  `).join('');

  if (!state.snapshots.length) {
    $('#snapshot-list').innerHTML = '<div class="empty-state">判定を保存すると、前回からの変化を比較できます。</div>';
  } else {
    $('#snapshot-list').innerHTML = [...state.snapshots].reverse().slice(0, 8).map((snapshot) => `
      <div class="snapshot-item">
        <div><strong>${escapeHtml(snapshot.label)}</strong><p>${new Date(snapshot.createdAt).toLocaleString('ja-JP')}</p></div>
        <div class="rank-value"><strong>${formatYen(snapshot.finalAssets, true)}</strong><span>最低 ${formatYen(snapshot.minAssets, true)} / ${escapeHtml(snapshot.statusLabel)}</span></div>
      </div>
    `).join('');
  }
}

function renderChart() {
  const series = ['low', 'base', 'high'].map((key) => ({ key, points: results[key].points }));
  const width = 980;
  const height = 340;
  const pad = { left: 72, right: 20, top: 22, bottom: 42 };
  const allValues = series.flatMap((s) => s.points.map((p) => p.assets));
  const rawMin = Math.min(0, ...allValues);
  const rawMax = Math.max(1, ...allValues);
  const range = Math.max(1, rawMax - rawMin);
  const min = rawMin - range * 0.08;
  const max = rawMax + range * 0.08;
  const maxYear = Math.max(...series.flatMap((s) => s.points.map((p) => p.year)));
  const x = (year) => pad.left + (year / maxYear) * (width - pad.left - pad.right);
  const y = (value) => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom);
  const linePath = (points) => points.map((p, i) => `${i ? 'L' : 'M'} ${x(p.year).toFixed(1)} ${y(p.assets).toFixed(1)}`).join(' ');
  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => min + ((max - min) * i) / (ticks - 1));
  const yearTicks = Array.from(new Set([0, Math.round(maxYear / 4), Math.round(maxYear / 2), Math.round(maxYear * .75), maxYear]));

  $('#cashflow-chart').innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${yTicks.map((value) => `<line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis-label" x="${pad.left - 12}" y="${y(value) + 4}" text-anchor="end">${Math.round(value / 10000).toLocaleString('ja-JP')}万</text>`).join('')}
      ${min <= 0 && max >= 0 ? `<line class="chart-zero" x1="${pad.left}" x2="${width - pad.right}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
      ${yearTicks.map((year) => `<text class="chart-axis-label" x="${x(year)}" y="${height - 14}" text-anchor="middle">${year}年後</text>`).join('')}
      ${series.map((s) => `<path class="chart-line ${s.key}" d="${linePath(s.points)}"/>`).join('')}
    </svg>
  `;
}

function renderInputs() {
  const confidence = calculateConfidence(state);
  $('#confidence-card').innerHTML = `<span>判定信頼度</span><strong>${confidence}%</strong><span>${confidence < 70 ? '仮定値を実績・見積へ置換してください' : '主要項目の根拠が揃っています'}</span><div class="confidence-bar"><i style="width:${confidence}%"></i></div>`;
  $('#input-groups').innerHTML = fieldGroups.map((group) => `
    <section class="input-group">
      <div class="input-group-header"><div><h3>${group.title}</h3><p>${group.description}</p></div></div>
      <div class="input-card-grid">${group.fields.map(renderInputCard).join('')}</div>
    </section>
  `).join('');

  $$('[data-input-field]').forEach((input) => input.addEventListener('change', (event) => {
    const { key, scenario } = event.target.dataset;
    state.assumptions[key][scenario] = Number(event.target.value || 0);
    queueSave();
    renderDashboard();
  }));
  $$('[data-source-field]').forEach((select) => select.addEventListener('change', (event) => {
    state.assumptions[event.target.dataset.sourceField].source = event.target.value;
    queueSave();
    renderInputs();
    renderDashboard();
  }));
  $$('[data-help-toggle]').forEach((button) => button.addEventListener('click', () => {
    const target = document.getElementById(`help-${button.dataset.helpToggle}`);
    target.hidden = !target.hidden;
  }));
  $$('[data-ai-prompt]').forEach((button) => button.addEventListener('click', async () => {
    const field = fieldGroups.flatMap((g) => g.fields).find((item) => item.key === button.dataset.aiPrompt);
    const prompt = buildAiPrompt(field);
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('AI用プロンプトをコピーしました。');
    } catch {
      window.prompt('このプロンプトをコピーしてください。', prompt);
    }
  }));
  $$('[data-reference]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.reference;
    const defaults = DEFAULT_STATE.assumptions[key];
    state.assumptions[key] = { ...defaults, source: defaults.source === 'actual' ? 'temporary_assumption' : defaults.source };
    queueSave();
    render();
    showToast('架空の参考値を仮置きしました。実値で更新してください。');
  }));
}

function renderInputCard(field) {
  const value = state.assumptions[field.key];
  return `
    <article class="input-card">
      <div class="input-card-header">
        <div><h3>${field.label}</h3><p>${field.description}</p></div>
        <span class="impact-pill">影響 ${field.impact}</span>
      </div>
      <div class="input-scenarios">
        ${['low', 'base', 'high'].map((scenario) => `
          <div class="field-wrap">
            <label>${scenarioLabel(scenario)}</label>
            <input type="number" step="any" value="${value[scenario]}" data-input-field data-key="${field.key}" data-scenario="${scenario}" aria-label="${field.label} ${scenarioLabel(scenario)}" />
          </div>
        `).join('')}
      </div>
      <div class="input-meta">
        <span>${field.unit}</span>
        <select class="source-select" data-source-field="${field.key}" aria-label="${field.label}の根拠">
          ${Object.entries(sourceLabels).map(([key, label]) => `<option value="${key}" ${value.source === key ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="input-actions">
        <button class="text-button" data-help-toggle="${field.key}">計算方法</button>
        <button class="text-button" data-reference="${field.key}">参考値を仮置き</button>
        <button class="text-button" data-ai-prompt="${field.key}">AI用プロンプト</button>
      </div>
      <div id="help-${field.key}" class="input-help" hidden><strong>計算方法：</strong>${field.formula}<br><strong>標準値：</strong>${formatValue(value.base, field.unit)}</div>
    </article>
  `;
}

function buildAiPrompt(field) {
  const current = state.assumptions[field.key];
  return `あなたは住宅住み替えシミュレーションの家計計算アシスタントです。\n\n【計算対象】\n${field.label}\n\n【目的】\n将来の家計が複数シナリオでも安全に維持できるか判断する。\n\n【依頼】\n${field.prompt}\n\n【現在の仮入力】\n楽観: ${current.low} ${field.unit}\n標準: ${current.base} ${field.unit}\n慎重: ${current.high} ${field.unit}\n根拠区分: ${sourceLabels[current.source]}\n\n【ルール】\n- 確定値・計算値・参考値・仮定値を区別する\n- 不足情報を勝手に補完しない\n- 二重計上を確認する\n- 楽観・標準・慎重の3ケースを示す\n- 計算式と代入過程を示す\n- 最も重要な不足情報を最大3件挙げる\n- 最後に次のJSONを出力する\n\n{\n  "field": "${field.key}",\n  "low": 0,\n  "base": 0,\n  "high": 0,\n  "source": "actual | contract | user_plan | public_reference | temporary_assumption",\n  "formula": "",\n  "missingInformation": [],\n  "doubleCountingRisks": []\n}`;
}

function renderActuals() {
  const summary = state.importedSummary;
  if (!summary) {
    $('#actual-summary').innerHTML = '<div class="empty-state">CSVを読み込むと、月次実績、予測との差、主要カテゴリを表示します。</div>';
    return;
  }
  const plannedIncome = state.assumptions.monthlyIncome.base;
  const plannedExpense = state.assumptions.monthlyLivingCost.base;
  const incomeVariance = summary.medianMonthlyIncome - plannedIncome;
  const expenseVariance = summary.medianMonthlyExpense - plannedExpense;
  $('#actual-summary').innerHTML = `
    <div class="actual-metrics">
      ${actualMetric('対象月', `${summary.months.length}か月`, `最新 ${summary.latestMonth}`)}
      ${actualMetric('収入中央値', formatYen(summary.medianMonthlyIncome, true), varianceText(incomeVariance, false))}
      ${actualMetric('支出中央値', formatYen(summary.medianMonthlyExpense, true), varianceText(expenseVariance, true))}
      ${actualMetric('除外した振替', `${summary.excludedTransfers}件`, `集計 ${summary.rowCount}件`)}
    </div>
    <article class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Apply actuals</p><h3>実績を予測へ反映</h3></div><div class="input-actions"><button id="apply-income" class="secondary-button">収入中央値を反映</button><button id="apply-expense" class="secondary-button">支出中央値を反映</button></div></div>
      <p>支出中央値には住宅費・投資・大型支出が含まれる可能性があります。カテゴリ内訳を確認してから反映してください。</p>
    </article>
    <article class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Categories</p><h3>支出カテゴリ上位</h3></div></div>
      <div style="overflow-x:auto"><table class="category-table"><thead><tr><th>カテゴリ</th><th>支出</th><th>件数</th></tr></thead><tbody>
        ${summary.categories.slice(0, 12).map((category) => `<tr><td>${escapeHtml(category.category)}</td><td>${formatYen(category.expense, true)}</td><td>${category.count}</td></tr>`).join('')}
      </tbody></table></div>
    </article>
  `;
  $('#apply-income').addEventListener('click', () => applyActual('monthlyIncome', summary.medianMonthlyIncome));
  $('#apply-expense').addEventListener('click', () => applyActual('monthlyLivingCost', summary.medianMonthlyExpense));
}

function actualMetric(label, value, note) {
  return `<div class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

function varianceText(value, expense) {
  const directionBad = expense ? value > 0 : value < 0;
  const sign = value > 0 ? '+' : '';
  return `<span class="${directionBad ? 'variance-positive' : 'variance-negative'}">予測差 ${sign}${formatYen(value, true)}</span>`;
}

function applyActual(key, value) {
  state.assumptions[key] = {
    low: Math.round(value * .95),
    base: Math.round(value),
    high: Math.round(value * 1.05),
    source: 'actual',
  };
  queueSave();
  render();
  showToast('実績中央値を予測値へ反映しました。');
}

function renderEvents() {
  if (!state.events.length) {
    $('#event-list').innerHTML = '<div class="empty-state">教育費、車、設備更新などのイベントを追加してください。</div>';
    return;
  }
  $('#event-list').innerHTML = state.events.map((event) => `
    <article class="event-card" data-event-id="${event.id}">
      <div><label>イベント名</label><input data-event-field="label" value="${escapeHtml(event.label)}" /></div>
      <div><label>開始（何年後）</label><input type="number" min="0" data-event-field="startYear" value="${event.startYear}" /></div>
      <div><label>継続年数</label><input type="number" min="1" data-event-field="duration" value="${event.duration}" /></div>
      <div><label>年間費用</label><input type="number" min="0" data-event-field="annualAmount" value="${event.annualAmount}" /></div>
      <label class="checkbox-wrap"><input type="checkbox" data-event-field="inflationLinked" ${event.inflationLinked ? 'checked' : ''} />物価連動</label>
      <button class="icon-button" data-delete-event="${event.id}" aria-label="${escapeHtml(event.label)}を削除">×</button>
    </article>
  `).join('');
  $$('[data-event-field]').forEach((input) => input.addEventListener('change', (event) => {
    const card = event.target.closest('[data-event-id]');
    const item = state.events.find((candidate) => candidate.id === card.dataset.eventId);
    const key = event.target.dataset.eventField;
    item[key] = event.target.type === 'checkbox' ? event.target.checked : (event.target.type === 'number' ? Number(event.target.value) : event.target.value);
    queueSave();
    renderDashboard();
  }));
  $$('[data-delete-event]').forEach((button) => button.addEventListener('click', () => {
    state.events = state.events.filter((event) => event.id !== button.dataset.deleteEvent);
    queueSave();
    render();
  }));
}

async function handleCsv(file) {
  const message = $('#csv-message');
  try {
    message.hidden = true;
    const text = await file.text();
    state.importedSummary = parseMoneyForwardCsv(text);
    await saveState(state);
    renderActuals();
    showToast('CSVを端末内で集計しました。');
  } catch (error) {
    message.textContent = error.message || 'CSVの読み込みに失敗しました。';
    message.hidden = false;
  }
}

function bindStaticEvents() {
  $$('.tab-button').forEach((button) => button.addEventListener('click', () => {
    state.ui.activeTab = button.dataset.tab;
    queueSave();
    renderTabs();
  }));
  $$('.scenario-toggle button').forEach((button) => button.addEventListener('click', () => {
    state.ui.selectedScenario = button.dataset.scenario;
    queueSave();
    renderDashboard();
  }));

  $('#save-snapshot').addEventListener('click', () => {
    const result = results.base;
    const statusLabel = ({ safe: '安全圏', caution: '要注意', danger: '危険' })[result.status];
    state.snapshots.push({ id: newId(), createdAt: new Date().toISOString(), label: state.profileName || '住み替え案', status: result.status, statusLabel, finalAssets: result.finalAssets, minAssets: result.minAssets, assumptions: structuredClone(state.assumptions) });
    queueSave();
    renderDashboard();
    showToast('現在の判定を保存しました。');
  });

  $('#select-csv').addEventListener('click', () => $('#csv-file').click());
  $('#csv-file').addEventListener('change', (event) => event.target.files[0] && handleCsv(event.target.files[0]));
  const dropZone = $('#drop-zone');
  ['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
  dropZone.addEventListener('drop', (event) => event.dataTransfer.files[0] && handleCsv(event.dataTransfer.files[0]));

  $('#add-event').addEventListener('click', () => {
    state.events.push({ id: newId(), label: '新しいイベント', startYear: 1, duration: 1, annualAmount: 0, inflationLinked: true });
    queueSave();
    renderEvents();
  });

  $('#export-backup').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `life-cashflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('バックアップを書き出しました。');
  });
  $('#import-backup').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state = mergeWithDefaults(parsed);
      await saveState(state);
      render();
      showToast('バックアップを復元しました。');
    } catch {
      showToast('有効なバックアップJSONではありません。');
    }
  });
  $('#reset-data').addEventListener('click', async () => {
    if (!window.confirm('この端末内の入力値、CSV集計、判定履歴を削除します。よろしいですか？')) return;
    await clearState();
    state = mergeWithDefaults(null);
    await saveState(state);
    render();
    showToast('架空サンプルへ初期化しました。');
  });
}

async function init() {
  state = mergeWithDefaults(await loadState());
  bindStaticEvents();
  render();
}

init();
