import {
  generateScenarioValues,
  getScenarioRangeDescription,
  isScenarioRangeFixed,
} from './scenario-ranges.js';

const wizardRoot = document.querySelector('#input-groups');
const inputTabButton = document.querySelector('[data-tab="inputs"]');
const dashboardTabButton = document.querySelector('[data-tab="dashboard"]');
const STEP_STORAGE_KEY = 'life-cashflow-input-step';
let applying = false;
let scheduled = false;

const AI_TASKS = {
  currentAssets: '現金・投資・解約可能資産に分けて合計し、二重計上がないか確認してください。',
  monthlyIncome: '年間の手取り給与、手取り賞与、継続収入から、世帯の月平均手取りを計算してください。',
  monthlyLivingCost: '月次支出から住宅費、投資、口座振替、一時的支出を除き、直近12か月の基本生活費の中央値を計算してください。',
  yearsUntilRetirement: '現在年齢と想定退職年齢から、給与収入が続く年数を計算してください。',
  monthlyPension: '夫婦の年金見込額と受給開始年齢を整理し、世帯の月額を計算してください。',
  currentLoanBalance: '住宅ローン返済予定表から、住み替え予定月時点の元本残高を特定してください。',
  salePrice: '複数の査定情報から、成約可能性を考慮した標準的な売却価格を提案してください。',
  saleCostRate: '仲介手数料、登記、契約関連費用を整理し、売却価格に対する費用率を計算してください。税金は別枠で示してください。',
  movingCost: '引越し、仮住まい、家具家電、二重負担期間の費用を積み上げてください。',
  newHomeCost: '土地、建物、付帯工事、外構、設計申請、諸費用、予備費に分解し、新居総額を計算してください。',
  cashContribution: '生活防衛資金を残したうえで、新居へ投入可能な自己資金を計算してください。',
  mortgageRate: '候補となる住宅ローン商品の適用金利、優遇条件、固定・変動の条件を整理し、標準値を提案してください。',
  loanYears: '借入時年齢、完済希望年齢、月返済上限から、返済期間を提案してください。',
  annualMaintenance: '固定資産税、保険、小修繕を年額に換算してください。大型設備更新は除外してください。',
  simulationYears: '現在年齢、ローン完済年齢、教育費、年金期間を踏まえ、必要なシミュレーション年数を提案してください。',
  incomeGrowthRate: '過去の給与実績から、手取り収入の年平均成長率を計算してください。',
  inflationRate: '将来予測を断定せず、家計の耐性確認に使う標準的な生活費上昇率を提案してください。',
  assetReturnRate: '現金と投資資産の配分を踏まえ、金融資産全体の税引後運用率を慎重に計算してください。',
  cashBufferMonths: '雇用安定性、家族人数、住宅保有リスクから、確保すべき生活防衛資金の月数を提案してください。',
};

function getStoredStep(max) {
  try {
    const parsed = Number(sessionStorage.getItem(STEP_STORAGE_KEY) || 0);
    return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 0, 0), Math.max(max - 1, 0));
  } catch {
    return 0;
  }
}

function storeStep(step) {
  try {
    sessionStorage.setItem(STEP_STORAGE_KEY, String(step));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function showWizardToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showWizardToast.timer);
  showWizardToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function iconForAction(type) {
  return ({ help: '？', reference: '↺', ai: 'AI' })[type];
}

function upgradeActionButtons(card) {
  const actions = card.querySelector('.input-actions');
  if (!actions) return;
  actions.classList.add('wizard-support-actions');
  const actionDefinitions = [
    ['[data-help-toggle]', 'help', '計算方法を確認'],
    ['[data-reference]', 'reference', '参考値を使う'],
    ['[data-ai-prompt]', 'ai', 'AIへの依頼文を確認'],
  ];
  actionDefinitions.forEach(([selector, type, label]) => {
    const button = actions.querySelector(selector);
    if (!button) return;
    button.classList.remove('text-button');
    button.classList.add('support-button', `support-button-${type}`);
    button.innerHTML = `<span class="support-button-icon" aria-hidden="true">${iconForAction(type)}</span><span>${label}</span>`;
  });
}

function getScenarioInputs(card) {
  const inputs = [...card.querySelectorAll('[data-input-field]')];
  return {
    key: inputs[0]?.dataset.key,
    low: inputs.find((input) => input.dataset.scenario === 'low'),
    base: inputs.find((input) => input.dataset.scenario === 'base'),
    high: inputs.find((input) => input.dataset.scenario === 'high'),
  };
}

function formatInputValue(value, unit) {
  const number = Number(value);
  const formatted = Number.isFinite(number) ? number.toLocaleString('ja-JP') : String(value ?? '');
  return `${formatted} ${unit}`.trim();
}

function updateScenarioStatus(card) {
  const { key, low, base, high } = getScenarioInputs(card);
  if (!key || !low || !base || !high) return;
  const status = card.querySelector('[data-scenario-status]');
  const unit = card.querySelector('[data-wizard-unit]')?.textContent?.trim() || '';
  const mode = card.dataset.scenarioMode === 'custom' ? '手動調整' : '自動設定';
  if (status) status.innerHTML = `<strong>${mode}</strong><span>楽観 ${formatInputValue(low.value, unit)} ／ 慎重 ${formatInputValue(high.value, unit)}</span>`;
}

function dispatchScenarioChange(input, value) {
  if (!input || Number(input.value) === Number(value)) return;
  input.value = String(value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function applyGeneratedScenarios(card) {
  const { key, low, base, high } = getScenarioInputs(card);
  if (!key || !low || !base || !high) return;
  const generated = generateScenarioValues(key, base.value);
  card.dataset.applyingScenarios = 'true';
  dispatchScenarioChange(low, generated.low);
  dispatchScenarioChange(high, generated.high);
  card.dataset.applyingScenarios = 'false';
  card.dataset.scenarioMode = 'auto';
  updateScenarioStatus(card);
}

function upgradeInputMeta(card) {
  const meta = card.querySelector('.input-meta');
  const select = meta?.querySelector('.source-select');
  if (!meta || !select || meta.querySelector('.wizard-source-field')) return;
  const unit = [...meta.children].find((child) => child.tagName === 'SPAN');
  if (unit) unit.dataset.wizardUnit = '';
  const sourceField = document.createElement('label');
  sourceField.className = 'wizard-source-field';
  sourceField.innerHTML = '<span>この値の根拠</span>';
  sourceField.append(select);
  meta.append(sourceField);
}

function upgradeScenarioInputs(card) {
  if (card.dataset.wizardFieldsUpgraded === 'true') return;
  const container = card.querySelector('.input-scenarios');
  const { key, low, base, high } = getScenarioInputs(card);
  if (!container || !key || !low || !base || !high) return;
  const lowWrap = low.closest('.field-wrap');
  const baseWrap = base.closest('.field-wrap');
  const highWrap = high.closest('.field-wrap');
  if (!lowWrap || !baseWrap || !highWrap) return;

  card.dataset.wizardFieldsUpgraded = 'true';
  baseWrap.classList.add('wizard-primary-field');
  baseWrap.querySelector('label').textContent = '標準値（まずここだけ入力）';
  lowWrap.querySelector('label').textContent = '楽観ケース（家計に有利）';
  highWrap.querySelector('label').textContent = '慎重ケース（家計に不利）';

  const guide = document.createElement('div');
  guide.className = 'wizard-answer-guide';
  guide.innerHTML = '<strong>入力するのは、まず1つだけです</strong><p>現時点で最も現実的だと思う値を「標準値」に入力してください。楽観・慎重の値は自動で設定します。</p>';

  const details = document.createElement('details');
  details.className = 'wizard-scenario-details';
  const fixed = isScenarioRangeFixed(key);
  details.innerHTML = `
    <summary>${fixed ? '3ケースで使う値を確認' : '楽観・慎重の値を確認・調整'} <span>任意</span></summary>
    <div class="wizard-scenario-details-body">
      <p class="wizard-range-description">${getScenarioRangeDescription(key)}</p>
      <div class="wizard-secondary-scenarios"></div>
      <div class="wizard-scenario-footer">
        <div class="wizard-scenario-status" data-scenario-status></div>
        <button type="button" class="secondary-button wizard-auto-scenarios">標準値から自動設定</button>
      </div>
    </div>
  `;
  details.querySelector('.wizard-secondary-scenarios').append(lowWrap, highWrap);
  container.replaceChildren(guide, baseWrap, details);

  const generated = generateScenarioValues(key, base.value);
  card.dataset.scenarioMode = Number(low.value) === generated.low && Number(high.value) === generated.high ? 'auto' : 'custom';
  base.addEventListener('change', () => {
    if (card.dataset.scenarioMode !== 'custom') applyGeneratedScenarios(card);
    else updateScenarioStatus(card);
  });
  [low, high].forEach((input) => input.addEventListener('change', () => {
    if (card.dataset.applyingScenarios !== 'true') card.dataset.scenarioMode = 'custom';
    updateScenarioStatus(card);
  }));
  details.querySelector('.wizard-auto-scenarios').addEventListener('click', () => {
    applyGeneratedScenarios(card);
    showWizardToast('標準値から楽観・慎重の値を設定しました。');
  });
  updateScenarioStatus(card);
}

function upgradeCard(card) {
  upgradeScenarioInputs(card);
  upgradeInputMeta(card);
  upgradeActionButtons(card);
}

function buildAiPrompt(card) {
  const { key, low, base, high } = getScenarioInputs(card);
  const label = card.querySelector('.input-card-header h3')?.textContent?.trim() || '入力項目';
  const unit = card.querySelector('[data-wizard-unit]')?.textContent?.trim() || '';
  const source = card.querySelector('.source-select option:checked')?.textContent?.trim() || '未設定';
  const formula = card.querySelector('.input-help')?.textContent?.replace(/\s+/g, ' ')?.trim() || '';
  const task = AI_TASKS[key] || `「${label}」の標準値を計算してください。`;
  return `あなたは住宅住み替えの家計計算を支援するアシスタントです。

【計算したい項目】
${label}

【依頼】
${task}

【現在アプリに入っている値】
- 標準値: ${base?.value || 0} ${unit}
- 楽観ケース: ${low?.value || 0} ${unit}
- 慎重ケース: ${high?.value || 0} ${unit}
- 値の根拠: ${source}

【アプリに表示されている計算方法】
${formula || '表示なし'}

【私が追加する情報】
- ここに給与明細、残高、見積書など、計算に必要な情報を追記します。

【回答ルール】
- 不足情報を勝手に補完せず、最初に不足情報を最大3件質問する
- 確定値、計算値、参考値、仮定値を区別する
- 二重計上の可能性を確認する
- まず、アプリへ入力する標準値を1つ示す
- 計算式と代入過程を示す
- 必要な場合だけ、標準値の妥当な範囲を補足する`;
}

function ensurePromptModal() {
  let modal = document.querySelector('#ai-prompt-preview');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'ai-prompt-preview';
  modal.className = 'ai-prompt-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="ai-prompt-backdrop" data-prompt-close></div>
    <section class="ai-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-prompt-title">
      <div class="ai-prompt-dialog-header">
        <div><p class="eyebrow">Prompt preview</p><h2 id="ai-prompt-title">AIへの依頼文を確認</h2></div>
        <button type="button" class="icon-button ai-prompt-close" data-prompt-close aria-label="閉じる">×</button>
      </div>
      <div class="ai-prompt-safety"><strong>まだコピーも送信もしていません</strong><span>下の全文を確認・編集した後、「この内容をコピー」を押した場合だけクリップボードへ保存します。</span></div>
      <textarea class="ai-prompt-text" aria-label="AIへ渡す依頼文"></textarea>
      <p class="ai-prompt-status" aria-live="polite"></p>
      <div class="ai-prompt-actions"><button type="button" class="secondary-button" data-prompt-close>閉じる</button><button type="button" class="primary-button" data-prompt-copy>この内容をコピー</button></div>
    </section>
  `;
  document.body.append(modal);
  const close = () => {
    modal.hidden = true;
    document.body.classList.remove('prompt-modal-open');
  };
  modal.querySelectorAll('[data-prompt-close]').forEach((button) => button.addEventListener('click', close));
  modal.querySelector('[data-prompt-copy]').addEventListener('click', async () => {
    const textarea = modal.querySelector('.ai-prompt-text');
    const status = modal.querySelector('.ai-prompt-status');
    try {
      await navigator.clipboard.writeText(textarea.value);
      status.textContent = 'この画面に表示されている内容をコピーしました。';
      showWizardToast('確認した依頼文をコピーしました。');
    } catch {
      textarea.focus();
      textarea.select();
      const copied = document.execCommand?.('copy');
      status.textContent = copied ? 'この画面に表示されている内容をコピーしました。' : 'コピーできませんでした。文章を選択してコピーしてください。';
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
  return modal;
}

function openPromptPreview(card) {
  const modal = ensurePromptModal();
  modal.querySelector('.ai-prompt-text').value = buildAiPrompt(card);
  modal.querySelector('.ai-prompt-status').textContent = '';
  modal.hidden = false;
  document.body.classList.add('prompt-modal-open');
  window.setTimeout(() => modal.querySelector('.ai-prompt-text').focus(), 0);
}

function showStep(step, { scroll = false } = {}) {
  const cards = [...wizardRoot.querySelectorAll('.input-card')];
  if (!cards.length) return;
  const safeStep = Math.min(Math.max(step, 0), cards.length - 1);
  const currentCard = cards[safeStep];
  const groups = [...wizardRoot.querySelectorAll('.input-group')];
  const currentGroup = currentCard.closest('.input-group');
  groups.forEach((group) => group.classList.toggle('wizard-group-active', group === currentGroup));
  cards.forEach((card, index) => card.classList.toggle('wizard-card-active', index === safeStep));
  const progress = wizardRoot.querySelector('[data-wizard-progress]');
  const progressFill = wizardRoot.querySelector('[data-wizard-progress-fill]');
  const category = wizardRoot.querySelector('[data-wizard-category]');
  const title = currentCard.querySelector('h3')?.textContent || '入力項目';
  const groupTitle = currentGroup?.querySelector('.input-group-header h3')?.textContent || '';
  if (progress) progress.textContent = `${safeStep + 1} / ${cards.length}`;
  if (progressFill) progressFill.style.width = `${((safeStep + 1) / cards.length) * 100}%`;
  if (category) category.textContent = groupTitle;
  const previousButton = wizardRoot.querySelector('[data-wizard-previous]');
  const nextButton = wizardRoot.querySelector('[data-wizard-next]');
  if (previousButton) previousButton.disabled = safeStep === 0;
  if (nextButton) {
    const isLast = safeStep === cards.length - 1;
    nextButton.innerHTML = isLast ? '<span>判定結果を見る</span><span aria-hidden="true">✓</span>' : '<span>この値で次へ</span><span aria-hidden="true">→</span>';
    nextButton.dataset.lastStep = String(isLast);
    nextButton.setAttribute('aria-label', isLast ? `${title}を保存して判定結果を見る` : `${title}を保存して次の項目へ進む`);
  }
  storeStep(safeStep);
  wizardRoot.dataset.currentStep = String(safeStep);
  if (scroll) document.querySelector('#tab-inputs .section-heading-row')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildWizard() {
  if (!wizardRoot || applying) return;
  const cards = [...wizardRoot.querySelectorAll('.input-card')];
  if (!cards.length || wizardRoot.querySelector('.input-wizard-header')) return;
  applying = true;
  try {
    cards.forEach(upgradeCard);
    const header = document.createElement('div');
    header.className = 'input-wizard-header';
    header.innerHTML = `<div class="wizard-progress-copy"><span class="wizard-category" data-wizard-category></span><strong><span data-wizard-progress></span></strong></div><div class="wizard-progress-track" aria-label="入力の進捗"><i data-wizard-progress-fill></i></div>`;
    const navigation = document.createElement('div');
    navigation.className = 'input-wizard-navigation';
    navigation.innerHTML = `<button type="button" class="secondary-button wizard-nav-button" data-wizard-previous><span aria-hidden="true">←</span><span>前の項目</span></button><span class="wizard-autosave"><i aria-hidden="true">✓</i> 入力内容は自動保存</span><button type="button" class="primary-button wizard-nav-button" data-wizard-next></button>`;
    wizardRoot.prepend(header);
    wizardRoot.append(navigation);
    navigation.querySelector('[data-wizard-previous]').addEventListener('click', () => {
      const current = Number(wizardRoot.dataset.currentStep || 0);
      showStep(current - 1, { scroll: true });
    });
    navigation.querySelector('[data-wizard-next]').addEventListener('click', (event) => {
      const current = Number(wizardRoot.dataset.currentStep || 0);
      if (event.currentTarget.dataset.lastStep === 'true') {
        dashboardTabButton?.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      showStep(current + 1, { scroll: true });
    });
    showStep(getStoredStep(cards.length));
  } finally {
    applying = false;
  }
}

function scheduleBuild() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    buildWizard();
  });
}

if (wizardRoot) {
  wizardRoot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ai-prompt]');
    if (!button || !wizardRoot.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPromptPreview(button.closest('.input-card'));
  }, true);
  const observer = new MutationObserver(scheduleBuild);
  observer.observe(wizardRoot, { childList: true, subtree: true });
  scheduleBuild();
}

inputTabButton?.addEventListener('click', scheduleBuild);
