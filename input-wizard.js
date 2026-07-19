const wizardRoot = document.querySelector('#input-groups');
const inputTabButton = document.querySelector('[data-tab="inputs"]');
const dashboardTabButton = document.querySelector('[data-tab="dashboard"]');
const STEP_STORAGE_KEY = 'life-cashflow-input-step';
let applying = false;
let scheduled = false;

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

function iconForAction(type) {
  return ({
    help: '？',
    reference: '↺',
    ai: 'AI',
  })[type];
}

function upgradeActionButtons(card) {
  const actions = card.querySelector('.input-actions');
  if (!actions) return;
  actions.classList.add('wizard-support-actions');

  const actionDefinitions = [
    ['[data-help-toggle]', 'help', '計算方法を見る'],
    ['[data-reference]', 'reference', '参考値を入れる'],
    ['[data-ai-prompt]', 'ai', 'AIで計算する'],
  ];

  actionDefinitions.forEach(([selector, type, label]) => {
    const button = actions.querySelector(selector);
    if (!button) return;
    button.classList.remove('text-button');
    button.classList.add('support-button', `support-button-${type}`);
    button.innerHTML = `<span class="support-button-icon" aria-hidden="true">${iconForAction(type)}</span><span>${label}</span>`;
  });
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
    nextButton.innerHTML = isLast
      ? '<span>判定結果を見る</span><span aria-hidden="true">✓</span>'
      : '<span>次の項目</span><span aria-hidden="true">→</span>';
    nextButton.dataset.lastStep = String(isLast);
    nextButton.setAttribute('aria-label', isLast ? `${title}を保存して判定結果を見る` : `${title}を保存して次の項目へ進む`);
  }

  storeStep(safeStep);
  wizardRoot.dataset.currentStep = String(safeStep);

  if (scroll) {
    document.querySelector('#tab-inputs .section-heading-row')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function buildWizard() {
  if (!wizardRoot || applying) return;
  const cards = [...wizardRoot.querySelectorAll('.input-card')];
  if (!cards.length || wizardRoot.querySelector('.input-wizard-header')) return;

  applying = true;
  try {
    cards.forEach(upgradeActionButtons);

    const header = document.createElement('div');
    header.className = 'input-wizard-header';
    header.innerHTML = `
      <div class="wizard-progress-copy">
        <span class="wizard-category" data-wizard-category></span>
        <strong>入力 <span data-wizard-progress></span></strong>
      </div>
      <div class="wizard-progress-track" aria-hidden="true"><i data-wizard-progress-fill></i></div>
    `;

    const navigation = document.createElement('div');
    navigation.className = 'input-wizard-navigation';
    navigation.innerHTML = `
      <button type="button" class="secondary-button wizard-nav-button" data-wizard-previous>
        <span aria-hidden="true">←</span><span>前の項目</span>
      </button>
      <span class="wizard-autosave"><i aria-hidden="true">✓</i> 入力内容は自動保存</span>
      <button type="button" class="primary-button wizard-nav-button" data-wizard-next></button>
    `;

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
  const observer = new MutationObserver(scheduleBuild);
  observer.observe(wizardRoot, { childList: true, subtree: true });
  scheduleBuild();
}

inputTabButton?.addEventListener('click', scheduleBuild);
