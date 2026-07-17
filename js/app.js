// app.js — Point d'entrée : navigation, rendu des vues, formulaires.
import * as store from './store.js';
import { ASSET_CLASSES, assetClass } from './store.js';
import * as drive from './drive.js';
import {
  fmtMoney, fmtCompact, fmtPct, fmtDate, fmtMonthLabel, todayISO, currentMonth, addMonths,
  el, clear, donutChart, barChart, lineChart, legend,
} from './ui.js';

// --- État de navigation ---------------------------------------------------
const state = {
  view: 'dashboard',
  month: currentMonth(),
};

const VIEWS = [
  { id: 'dashboard',   label: 'Tableau de bord', icon: '📊' },
  { id: 'transactions', label: 'Dépenses',        icon: '💸' },
  { id: 'budgets',     label: 'Budgets',         icon: '🎯' },
  { id: 'investments', label: 'Investissements', icon: '📈' },
  { id: 'plan',        label: 'Plan',            icon: '🧭' },
  { id: 'settings',    label: 'Réglages',        icon: '⚙️' },
];

const root = document.getElementById('view');
const navHost = document.getElementById('nav');
const monthBar = document.getElementById('monthbar');

// --- Modale réutilisable --------------------------------------------------
function openModal(title, bodyNode, { onSubmit, submitLabel = 'Enregistrer', danger } = {}) {
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const form = el('form', { class: 'modal', onsubmit: (e) => { e.preventDefault(); onSubmit && onSubmit(); } }, [
    el('header', { class: 'modal-head' }, [
      el('h2', { text: title }),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer', text: '✕', onclick: close }),
    ]),
    el('div', { class: 'modal-body' }, bodyNode),
    el('footer', { class: 'modal-foot' }, [
      el('button', { type: 'button', class: 'btn ghost', text: 'Annuler', onclick: close }),
      onSubmit ? el('button', { type: 'submit', class: 'btn ' + (danger ? 'danger' : 'primary'), text: submitLabel }) : null,
    ]),
  ]);
  overlay.append(form);
  document.body.append(overlay);
  const first = form.querySelector('input,select,textarea');
  if (first) first.focus();
  function close() { overlay.remove(); }
  return { close };
}

// Petit champ de formulaire étiqueté.
function field(label, inputNode) {
  return el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), inputNode]);
}

// --- Rendu principal ------------------------------------------------------
function render() {
  renderNav();
  renderMonthBar();
  clear(root);
  const view = ({
    dashboard: viewDashboard,
    transactions: viewTransactions,
    recurring: viewRecurring,
    budgets: viewBudgets,
    investments: viewInvestments,
    plan: viewPlan,
    settings: viewSettings,
  })[state.view] || viewDashboard;
  root.append(view());
}

function renderNav() {
  clear(navHost);
  VIEWS.forEach((v) => {
    navHost.append(el('button', {
      class: 'nav-item' + (state.view === v.id ? ' active' : ''),
      onclick: () => { state.view = v.id; render(); },
    }, [
      el('span', { class: 'nav-icon', text: v.icon }),
      el('span', { class: 'nav-label', text: v.label }),
    ]));
  });
}

// La barre de mois n'apparaît que là où c'est pertinent.
function renderMonthBar() {
  clear(monthBar);
  const showMonth = ['dashboard', 'transactions', 'budgets'].includes(state.view);
  monthBar.style.display = showMonth ? 'flex' : 'none';
  if (!showMonth) return;
  const parts = [
    el('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Mois précédent', onclick: () => { state.month = addMonths(state.month, -1); render(); } }),
    el('span', { class: 'monthbar-label', text: fmtMonthLabel(state.month) }),
    el('button', { class: 'icon-btn', text: '›', 'aria-label': 'Mois suivant', onclick: () => { state.month = addMonths(state.month, 1); render(); } }),
    state.month !== currentMonth()
      ? el('button', { class: 'btn ghost small', text: "Aujourd'hui", onclick: () => { state.month = currentMonth(); render(); } })
      : null,
  ].filter(Boolean);
  parts.forEach((p) => monthBar.append(p));
}

// --- Calculs partagés -----------------------------------------------------
function monthTotals(month) {
  const txs = store.transactionsForMonth(month);
  let income = 0, expense = 0;
  txs.forEach((t) => { if (t.type === 'income') income += +t.amount || 0; else expense += +t.amount || 0; });
  return { income, expense, balance: income - expense, txs };
}

function expenseByCategory(month) {
  const map = new Map();
  store.transactionsForMonth(month).forEach((t) => {
    if (t.type !== 'expense') return;
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + (+t.amount || 0));
  });
  return [...map.entries()]
    .map(([id, value]) => {
      const c = store.getCategory(id);
      return { id, value, label: c?.name || 'Sans catégorie', color: c?.color || '#94a3b8', icon: c?.icon || '📦' };
    })
    .sort((a, b) => b.value - a.value);
}

function portfolioTotals() {
  const h = store.getHoldings();
  const invested = h.reduce((s, x) => s + (+x.invested || 0), 0);
  const value = h.reduce((s, x) => s + (+x.currentValue || 0), 0);
  const gain = value - invested;
  const pct = invested > 0 ? (gain / invested) * 100 : 0;
  return { invested, value, gain, pct };
}

// =========================================================================
// VUE : TABLEAU DE BORD
// =========================================================================
function viewDashboard() {
  const wrap = el('section', { class: 'view' });
  const { income, expense, balance } = monthTotals(state.month);
  const port = portfolioTotals();

  // Cartes de synthèse
  const cards = el('div', { class: 'cards' }, [
    statCard('Revenus', fmtMoney(income), 'positive'),
    statCard('Dépenses', fmtMoney(expense), 'negative'),
    statCard('Solde du mois', fmtMoney(balance, { sign: true }), balance >= 0 ? 'positive' : 'negative'),
    statCard('Patrimoine', fmtMoney(port.value), 'neutral', '', port.invested ? fmtPct(port.pct) + ' de plus-value' : ''),
  ]);
  wrap.append(cards);

  // Répartition des dépenses (donut) + budget global
  const byCat = expenseByCategory(state.month);
  const budgetTotal = store.getCategories().filter((c) => c.type === 'expense').reduce((s, c) => s + (+c.monthlyBudget || 0), 0);

  const donutCard = card('Répartition des dépenses', el('div', { class: 'donut-row' }, [
    byCat.length
      ? donutChart(byCat, { centerLabel: fmtCompact(expense), centerSub: 'dépensé' })
      : el('div', { class: 'empty', text: 'Aucune dépense ce mois-ci.' }),
    byCat.length ? legend(byCat.slice(0, 6).map((s) => ({ label: `${s.icon} ${s.label}`, color: s.color, value: fmtMoney(s.value) }))) : null,
  ]));

  // Historique des 6 derniers mois (revenus vs dépenses)
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(state.month, -i));
  const bars = months.map((m) => {
    const t = monthTotals(m);
    return { label: fmtMonthLabel(m).split(' ')[0].slice(0, 4), value: t.expense, color: 'var(--danger)' };
  });
  const trendCard = card('Dépenses des 6 derniers mois', barChart(bars));

  wrap.append(el('div', { class: 'grid-2' }, [donutCard, trendCard]));

  // Suivi budget rapide
  if (budgetTotal > 0) {
    const consumed = expense;
    wrap.append(card('Budget du mois', el('div', {}, [
      progressRow('Total budgété', consumed, budgetTotal),
    ])));
  }

  // Aperçu patrimoine
  const holdings = store.getHoldings();
  if (holdings.length) {
    const alloc = allocByClass();
    wrap.append(el('div', { class: 'grid-2' }, [
      card('Allocation du patrimoine', el('div', { class: 'donut-row' }, [
        donutChart(alloc, { centerLabel: fmtCompact(port.value), centerSub: 'patrimoine' }),
        legend(alloc.map((s) => ({ label: s.label, color: s.color, value: fmtMoney(s.value) }))),
      ])),
      card('Performance', el('div', { class: 'perf' }, [
        perfRow('Investi', fmtMoney(port.invested)),
        perfRow('Valeur actuelle', fmtMoney(port.value)),
        perfRow('Plus/moins-value', fmtMoney(port.gain, { sign: true }), port.gain >= 0 ? 'positive' : 'negative'),
        perfRow('Performance', fmtPct(port.pct), port.gain >= 0 ? 'positive' : 'negative'),
      ])),
    ]));
  }

  if (!byCat.length && !holdings.length) {
    wrap.append(emptyState());
  }
  return wrap;
}

function statCard(label, value, tone = 'neutral', arrow = '', sub = '') {
  return el('div', { class: 'stat ' + tone }, [
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-value', text: value }),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null,
  ]);
}

function card(title, body, actions) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: title }),
      actions || null,
    ]),
    body,
  ]);
}

function progressRow(label, consumed, budget) {
  const pct = budget > 0 ? Math.min(100, (consumed / budget) * 100) : 0;
  const over = consumed > budget;
  return el('div', { class: 'progress-row' }, [
    el('div', { class: 'progress-top' }, [
      el('span', { text: label }),
      el('span', { class: over ? 'negative' : '', text: `${fmtMoney(consumed)} / ${fmtMoney(budget)}` }),
    ]),
    el('div', { class: 'progress' }, [
      el('div', { class: 'progress-fill' + (over ? ' over' : ''), style: `width:${pct}%` }),
    ]),
  ]);
}

function perfRow(label, value, tone = '') {
  return el('div', { class: 'perf-row' }, [
    el('span', { class: 'perf-label', text: label }),
    el('span', { class: 'perf-val ' + tone, text: value }),
  ]);
}

function allocByClass() {
  const map = new Map();
  store.getHoldings().forEach((h) => {
    map.set(h.class, (map.get(h.class) || 0) + (+h.currentValue || 0));
  });
  return [...map.entries()].map(([key, value]) => {
    const c = assetClass(key);
    return { label: c.label, color: c.color, value };
  }).sort((a, b) => b.value - a.value);
}

function emptyState() {
  return el('div', { class: 'card empty-card' }, [
    el('h3', { text: '👋 Bienvenue !' }),
    el('p', { text: 'Commence par ajouter une dépense ou un investissement. Tes données restent sur cet appareil.' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn primary', text: '＋ Ajouter une dépense', onclick: () => txModal() }),
      el('button', { class: 'btn', text: '📈 Ajouter un investissement', onclick: () => holdingModal() }),
      el('button', { class: 'btn ghost', text: 'Charger un exemple', onclick: () => { store.loadDemo(); } }),
    ]),
  ]);
}

// =========================================================================
// VUE : DÉPENSES (transactions)
// =========================================================================
function viewTransactions() {
  const wrap = el('section', { class: 'view' });
  const { income, expense, balance, txs } = monthTotals(state.month);

  wrap.append(el('div', { class: 'view-head' }, [
    el('h1', { text: 'Dépenses' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn ghost', text: '🔁 Récurrentes', onclick: () => { state.view = 'recurring'; render(); } }),
      el('button', { class: 'btn primary', text: '＋ Ajouter', onclick: () => txModal() }),
    ]),
  ]));

  wrap.append(el('div', { class: 'cards mini' }, [
    statCard('Revenus', fmtMoney(income), 'positive'),
    statCard('Dépenses', fmtMoney(expense), 'negative'),
    statCard('Solde', fmtMoney(balance, { sign: true }), balance >= 0 ? 'positive' : 'negative'),
  ]));

  if (!txs.length) {
    wrap.append(el('div', { class: 'card empty-card' }, [
      el('p', { text: 'Aucune opération pour ' + fmtMonthLabel(state.month) + '.' }),
      el('button', { class: 'btn primary', text: '＋ Ajouter une opération', onclick: () => txModal() }),
    ]));
    return wrap;
  }

  const list = el('div', { class: 'card list' });
  txs.forEach((t) => {
    const c = store.getCategory(t.categoryId);
    list.append(el('div', { class: 'list-row', onclick: () => txModal(t) }, [
      el('div', { class: 'list-icon', style: `background:${(c?.color || '#94a3b8')}22`, text: c?.icon || '📦' }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: (t.recurringId ? '🔁 ' : '') + (t.note || c?.name || 'Opération') }),
        el('div', { class: 'list-sub', text: (c?.name || 'Sans catégorie') + ' · ' + fmtDate(t.date) }),
      ]),
      el('div', { class: 'list-amount ' + (t.type === 'income' ? 'positive' : 'negative'),
        text: (t.type === 'income' ? '+ ' : '− ') + fmtMoney(t.amount) }),
    ]));
  });
  wrap.append(list);
  return wrap;
}

// Formulaire d'ajout/édition d'une transaction.
function txModal(tx) {
  const isEdit = !!tx;
  const cats = store.getCategories();
  const typeSel = el('select', { class: 'input' },
    [el('option', { value: 'expense', text: 'Dépense' }), el('option', { value: 'income', text: 'Revenu' })]);
  typeSel.value = tx?.type || 'expense';

  const amount = el('input', { class: 'input', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0,00', value: tx?.amount ?? '' });
  const date = el('input', { class: 'input', type: 'date', value: tx?.date || todayISO() });
  const note = el('input', { class: 'input', type: 'text', placeholder: 'Ex. Courses Carrefour', value: tx?.note || '' });

  const catSel = el('select', { class: 'input' });
  function fillCats() {
    clear(catSel);
    cats.filter((c) => c.type === typeSel.value).forEach((c) =>
      catSel.append(el('option', { value: c.id, text: `${c.icon} ${c.name}` })));
    if (tx?.categoryId && cats.find((c) => c.id === tx.categoryId)?.type === typeSel.value) catSel.value = tx.categoryId;
  }
  fillCats();
  typeSel.addEventListener('change', fillCats);

  const body = el('div', {}, [
    field('Type', typeSel),
    field('Montant (€)', amount),
    field('Catégorie', catSel),
    field('Date', date),
    field('Libellé', note),
    isEdit ? el('button', {
      type: 'button', class: 'btn danger ghost full', text: '🗑 Supprimer cette opération',
      onclick: () => { store.deleteTransaction(tx.id); modal.close(); },
    }) : null,
  ]);

  const modal = openModal(isEdit ? 'Modifier l’opération' : 'Nouvelle opération', body, {
    submitLabel: isEdit ? 'Enregistrer' : 'Ajouter',
    onSubmit: () => {
      const val = parseFloat(String(amount.value).replace(',', '.'));
      if (!(val > 0)) { amount.focus(); return; }
      const payload = { type: typeSel.value, amount: val, categoryId: catSel.value || null, date: date.value || todayISO(), note: note.value.trim() };
      if (isEdit) store.updateTransaction(tx.id, payload); else store.addTransaction(payload);
      modal.close();
    },
  });
}

// =========================================================================
// VUE : OPÉRATIONS RÉCURRENTES
// =========================================================================
function viewRecurring() {
  const wrap = el('section', { class: 'view' });
  wrap.append(el('div', { class: 'view-head' }, [
    el('div', { class: 'row' }, [
      el('button', { class: 'icon-btn', text: '‹', 'aria-label': 'Retour', onclick: () => { state.view = 'transactions'; render(); } }),
      el('h1', { text: 'Opérations récurrentes' }),
    ]),
    el('button', { class: 'btn primary', text: '＋ Ajouter', onclick: () => recurringModal() }),
  ]));

  const recs = store.getRecurrings();
  if (!recs.length) {
    wrap.append(el('div', { class: 'card empty-card' }, [
      el('p', { text: 'Automatise tes opérations qui reviennent : loyer, abonnements, salaire… Elles seront créées toutes seules à chaque échéance.' }),
      el('button', { class: 'btn primary', text: '＋ Créer une récurrence', onclick: () => recurringModal() }),
    ]));
    return wrap;
  }

  const list = el('div', { class: 'card list' });
  recs.slice().sort((a, b) => (a.note || '').localeCompare(b.note || '')).forEach((r) => {
    const c = store.getCategory(r.categoryId);
    const due = store.nextDueDate(r);
    const inactive = r.active === false;
    list.append(el('div', { class: 'list-row' + (inactive ? ' muted-row' : ''), onclick: () => recurringModal(r) }, [
      el('div', { class: 'list-icon', style: `background:${(c?.color || '#94a3b8')}22`, text: c?.icon || '🔁' }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: r.note || c?.name || 'Récurrence' }),
        el('div', { class: 'list-sub', text: store.frequencyLabel(r.frequency) + (inactive ? ' · en pause' : (due ? ' · prochaine : ' + fmtDate(due) : '')) }),
      ]),
      el('div', { class: 'list-amount ' + (r.type === 'income' ? 'positive' : 'negative'),
        text: (r.type === 'income' ? '+ ' : '− ') + fmtMoney(r.amount) }),
    ]));
  });
  wrap.append(list);
  wrap.append(el('p', { class: 'footnote', text: 'Les opérations sont créées automatiquement à l’ouverture de l’app, à chaque échéance passée. Elles apparaissent alors dans « Dépenses » avec le repère 🔁.' }));
  return wrap;
}

function recurringModal(r) {
  const isEdit = !!r;
  const cats = store.getCategories();
  const typeSel = el('select', { class: 'input' },
    [el('option', { value: 'expense', text: 'Dépense' }), el('option', { value: 'income', text: 'Revenu' })]);
  typeSel.value = r?.type || 'expense';

  const amount = el('input', { class: 'input', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0,00', value: r?.amount ?? '' });
  const note = el('input', { class: 'input', type: 'text', placeholder: 'Ex. Loyer, Netflix, Salaire…', value: r?.note || '' });

  const freqSel = el('select', { class: 'input' },
    store.FREQUENCIES.map((f) => el('option', { value: f.key, text: f.label })));
  freqSel.value = r?.frequency || 'monthly';

  const startDate = el('input', { class: 'input', type: 'date', value: r?.startDate || todayISO() });

  const catSel = el('select', { class: 'input' });
  function fillCats() {
    clear(catSel);
    cats.filter((c) => c.type === typeSel.value).forEach((c) =>
      catSel.append(el('option', { value: c.id, text: `${c.icon} ${c.name}` })));
    if (r?.categoryId && cats.find((c) => c.id === r.categoryId)?.type === typeSel.value) catSel.value = r.categoryId;
  }
  fillCats();
  typeSel.addEventListener('change', fillCats);

  const activeSel = el('select', { class: 'input' },
    [el('option', { value: 'yes', text: 'Active' }), el('option', { value: 'no', text: 'En pause' })]);
  activeSel.value = (r && r.active === false) ? 'no' : 'yes';

  const body = el('div', {}, [
    field('Type', typeSel),
    field('Montant (€)', amount),
    field('Libellé', note),
    field('Catégorie', catSel),
    field('Fréquence', freqSel),
    field('Date de début', startDate),
    isEdit ? field('État', activeSel) : null,
    el('p', { class: 'muted', text: 'La date de début fixe le jour d’échéance. Une date passée crée les opérations manquantes jusqu’à aujourd’hui.' }),
    isEdit ? el('button', { type: 'button', class: 'btn danger ghost full', text: '🗑 Supprimer la récurrence',
      onclick: () => { store.deleteRecurring(r.id); modal.close(); } }) : null,
  ]);

  const modal = openModal(isEdit ? 'Modifier la récurrence' : 'Nouvelle récurrence', body, {
    submitLabel: isEdit ? 'Enregistrer' : 'Ajouter',
    onSubmit: () => {
      const val = parseFloat(String(amount.value).replace(',', '.'));
      if (!(val > 0)) { amount.focus(); return; }
      const payload = {
        type: typeSel.value, amount: val, note: note.value.trim(),
        categoryId: catSel.value || null, frequency: freqSel.value,
        startDate: startDate.value || todayISO(),
        active: activeSel.value !== 'no',
      };
      if (isEdit) store.updateRecurring(r.id, payload);
      else store.addRecurring(payload);
      store.generateDueRecurrings(); // rattrape immédiatement les échéances dues
      modal.close();
    },
  });
}

// =========================================================================
// VUE : BUDGETS
// =========================================================================
function viewBudgets() {
  const wrap = el('section', { class: 'view' });
  wrap.append(el('div', { class: 'view-head' }, [
    el('h1', { text: 'Budgets mensuels' }),
    el('button', { class: 'btn', text: '＋ Catégorie', onclick: () => categoryModal() }),
  ]));

  const spent = new Map();
  store.transactionsForMonth(state.month).forEach((t) => {
    if (t.type === 'expense') spent.set(t.categoryId, (spent.get(t.categoryId) || 0) + (+t.amount || 0));
  });

  const expCats = store.getCategories().filter((c) => c.type === 'expense');
  const totalBudget = expCats.reduce((s, c) => s + (+c.monthlyBudget || 0), 0);
  const totalSpent = [...spent.values()].reduce((s, v) => s + v, 0);

  wrap.append(card('Vue d’ensemble', progressRow('Total dépensé', totalSpent, totalBudget || totalSpent)));

  const list = el('div', { class: 'card' });
  expCats.forEach((c) => {
    const used = spent.get(c.id) || 0;
    const budget = +c.monthlyBudget || 0;
    list.append(el('div', { class: 'budget-row', onclick: () => categoryModal(c) }, [
      el('div', { class: 'budget-head' }, [
        el('span', {}, [el('span', { text: c.icon + '  ' }), el('strong', { text: c.name })]),
        el('span', { class: used > budget && budget > 0 ? 'negative' : 'muted',
          text: budget > 0 ? `${fmtMoney(used)} / ${fmtMoney(budget)}` : fmtMoney(used) + ' (pas de budget)' }),
      ]),
      budget > 0 ? el('div', { class: 'progress' }, [
        el('div', { class: 'progress-fill' + (used > budget ? ' over' : ''),
          style: `width:${Math.min(100, (used / budget) * 100)}%;background:${c.color}` }),
      ]) : null,
    ]));
  });
  wrap.append(list);
  return wrap;
}

function categoryModal(cat) {
  const isEdit = !!cat;
  const name = el('input', { class: 'input', type: 'text', value: cat?.name || '', placeholder: 'Ex. Vacances' });
  const icon = el('input', { class: 'input', type: 'text', maxlength: '2', value: cat?.icon || '📦', style: 'font-size:1.4rem;text-align:center' });
  const color = el('input', { class: 'input color', type: 'color', value: cat?.color || '#6366f1' });
  const typeSel = el('select', { class: 'input' },
    [el('option', { value: 'expense', text: 'Dépense' }), el('option', { value: 'income', text: 'Revenu' })]);
  typeSel.value = cat?.type || 'expense';
  const budget = el('input', { class: 'input', type: 'number', step: '1', min: '0', value: cat?.monthlyBudget || '', placeholder: '0' });

  const body = el('div', {}, [
    field('Nom', name),
    el('div', { class: 'row-2' }, [field('Emoji', icon), field('Couleur', color)]),
    field('Type', typeSel),
    field('Budget mensuel (€)', budget),
    isEdit ? el('button', { type: 'button', class: 'btn danger ghost full', text: '🗑 Supprimer la catégorie',
      onclick: () => { store.deleteCategory(cat.id); modal.close(); } }) : null,
  ]);

  const modal = openModal(isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie', body, {
    onSubmit: () => {
      if (!name.value.trim()) { name.focus(); return; }
      const payload = { name: name.value.trim(), icon: icon.value || '📦', color: color.value, type: typeSel.value, monthlyBudget: parseFloat(budget.value) || 0 };
      if (isEdit) store.updateCategory(cat.id, payload); else store.addCategory(payload);
      modal.close();
    },
  });
}

// =========================================================================
// VUE : INVESTISSEMENTS
// =========================================================================
function viewInvestments() {
  const wrap = el('section', { class: 'view' });
  const port = portfolioTotals();
  wrap.append(el('div', { class: 'view-head' }, [
    el('h1', { text: 'Investissements' }),
    el('button', { class: 'btn primary', text: '＋ Ajouter', onclick: () => holdingModal() }),
  ]));

  wrap.append(el('div', { class: 'cards mini' }, [
    statCard('Investi', fmtMoney(port.invested), 'neutral'),
    statCard('Valeur actuelle', fmtMoney(port.value), 'neutral'),
    statCard('Plus/moins-value', fmtMoney(port.gain, { sign: true }), port.gain >= 0 ? 'positive' : 'negative', '', fmtPct(port.pct)),
  ]));

  const holdings = store.getHoldings();
  if (!holdings.length) {
    wrap.append(el('div', { class: 'card empty-card' }, [
      el('p', { text: 'Aucun placement enregistré.' }),
      el('button', { class: 'btn primary', text: '＋ Ajouter un placement', onclick: () => holdingModal() }),
    ]));
    return wrap;
  }

  const alloc = allocByClass();
  wrap.append(card('Allocation', el('div', { class: 'donut-row' }, [
    donutChart(alloc, { centerLabel: fmtCompact(port.value), centerSub: 'total' }),
    legend(alloc.map((s) => ({ label: s.label, color: s.color,
      value: fmtMoney(s.value) + '  ·  ' + (port.value ? Math.round((s.value / port.value) * 100) : 0) + '%' }))),
  ])));

  const list = el('div', { class: 'card list' });
  holdings.forEach((h) => {
    const c = assetClass(h.class);
    const gain = (+h.currentValue || 0) - (+h.invested || 0);
    const pct = h.invested > 0 ? (gain / h.invested) * 100 : 0;
    list.append(el('div', { class: 'list-row', onclick: () => holdingModal(h) }, [
      el('div', { class: 'list-icon', style: `background:${c.color}22`, text: c.icon }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: h.name }),
        el('div', { class: 'list-sub', text: c.label + ' · investi ' + fmtMoney(h.invested) }),
      ]),
      el('div', { class: 'list-amount-col' }, [
        el('div', { class: 'list-amount', text: fmtMoney(h.currentValue) }),
        el('div', { class: 'list-sub ' + (gain >= 0 ? 'positive' : 'negative'), text: fmtMoney(gain, { sign: true }) + ' · ' + fmtPct(pct) }),
      ]),
    ]));
  });
  wrap.append(list);
  return wrap;
}

function holdingModal(h) {
  const isEdit = !!h;
  const name = el('input', { class: 'input', type: 'text', value: h?.name || '', placeholder: 'Ex. PEA Bourse Direct' });
  const classSel = el('select', { class: 'input' },
    ASSET_CLASSES.map((c) => el('option', { value: c.key, text: `${c.icon} ${c.label}` })));
  classSel.value = h?.class || 'pea';
  const invested = el('input', { class: 'input', type: 'number', step: '0.01', min: '0', value: h?.invested ?? '', placeholder: '0' });
  const value = el('input', { class: 'input', type: 'number', step: '0.01', min: '0', value: h?.currentValue ?? '', placeholder: '0' });
  const note = el('input', { class: 'input', type: 'text', value: h?.note || '', placeholder: 'Remarque (facultatif)' });

  const body = el('div', {}, [
    field('Nom du placement', name),
    field('Type', classSel),
    el('div', { class: 'row-2' }, [field('Montant investi (€)', invested), field('Valeur actuelle (€)', value)]),
    field('Note', note),
    isEdit ? el('button', { type: 'button', class: 'btn danger ghost full', text: '🗑 Supprimer le placement',
      onclick: () => { store.deleteHolding(h.id); modal.close(); } }) : null,
  ]);

  const modal = openModal(isEdit ? 'Modifier le placement' : 'Nouveau placement', body, {
    onSubmit: () => {
      if (!name.value.trim()) { name.focus(); return; }
      const inv = parseFloat(String(invested.value).replace(',', '.')) || 0;
      const val = value.value === '' ? inv : parseFloat(String(value.value).replace(',', '.')) || 0;
      const payload = { name: name.value.trim(), class: classSel.value, invested: inv, currentValue: val, note: note.value.trim() };
      if (isEdit) store.updateHolding(h.id, payload); else store.addHolding(payload);
      modal.close();
    },
  });
}

// =========================================================================
// VUE : PLAN D'INVESTISSEMENT (projection à intérêts composés)
// =========================================================================
function projectPlan(p) {
  const months = Math.max(1, Math.round((p.years || 0) * 12));
  const r = (p.expectedReturn || 0) / 100 / 12;
  const initial = +p.initial || 0;
  const pmt = +p.amount || 0;
  const points = [];
  const contribPoints = [];
  let value = initial;
  let contributed = initial;
  for (let m = 0; m <= months; m++) {
    if (m > 0) { value = value * (1 + r) + pmt; contributed += pmt; }
    if (m % 3 === 0 || m === months) {
      points.push({ x: m / 12, y: value });
      contribPoints.push({ x: m / 12, y: contributed });
    }
  }
  return { months, points, contribPoints, finalValue: value, contributed, gain: value - contributed };
}

function viewPlan() {
  const wrap = el('section', { class: 'view' });
  wrap.append(el('div', { class: 'view-head' }, [
    el('h1', { text: 'Plan d’investissement' }),
    el('button', { class: 'btn primary', text: '＋ Nouveau plan', onclick: () => planModal() }),
  ]));

  const plans = store.getPlans();
  if (!plans.length) {
    wrap.append(el('div', { class: 'card empty-card' }, [
      el('p', { text: 'Simule la croissance d’un investissement régulier grâce aux intérêts composés.' }),
      el('button', { class: 'btn primary', text: '＋ Créer un plan', onclick: () => planModal() }),
    ]));
    return wrap;
  }

  plans.forEach((p) => {
    const proj = projectPlan(p);
    // Étiquettes alignées sur les points échantillonnés (pas de 3 mois) : tous les 5 ans.
    const sampledLabels = proj.points.map((pt) => {
      const yy = Math.round(pt.x);
      return Math.abs(pt.x - yy) < 0.001 && yy > 0 && yy % 5 === 0 ? `${yy} ans` : '';
    });

    const chart = lineChart([
      { points: proj.points, color: 'var(--accent)', fill: true },
      { points: proj.contribPoints, color: 'var(--muted-strong)' },
    ], { xLabels: sampledLabels });

    wrap.append(card(p.label || 'Plan', el('div', {}, [
      el('div', { class: 'plan-summary' }, [
        perfRow('Versement mensuel', fmtMoney(p.amount)),
        perfRow('Capital de départ', fmtMoney(p.initial || 0)),
        perfRow('Rendement annuel visé', (p.expectedReturn || 0) + ' %'),
        perfRow('Horizon', (p.years || 0) + ' ans'),
        el('hr', {}),
        perfRow('Total versé', fmtMoney(proj.contributed)),
        perfRow('Valeur estimée', fmtMoney(proj.finalValue), 'positive'),
        perfRow('Intérêts gagnés', fmtMoney(proj.gain, { sign: true }), 'positive'),
      ]),
      el('div', { class: 'chart-scroll' }, chart),
      legend([
        { label: 'Valeur projetée (avec intérêts)', color: 'var(--accent)' },
        { label: 'Total versé (sans intérêts)', color: 'var(--muted-strong)' },
      ]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn ghost small', text: 'Modifier', onclick: () => planModal(p) }),
      ]),
    ])));
  });
  return wrap;
}

function planModal(p) {
  const isEdit = !!p;
  const label = el('input', { class: 'input', type: 'text', value: p?.label || '', placeholder: 'Ex. Versement PEA' });
  const amount = el('input', { class: 'input', type: 'number', step: '10', min: '0', value: p?.amount ?? 300 });
  const initial = el('input', { class: 'input', type: 'number', step: '100', min: '0', value: p?.initial ?? 0 });
  const ret = el('input', { class: 'input', type: 'number', step: '0.5', min: '0', value: p?.expectedReturn ?? 6 });
  const years = el('input', { class: 'input', type: 'number', step: '1', min: '1', max: '60', value: p?.years ?? 20 });

  const body = el('div', {}, [
    field('Nom du plan', label),
    field('Versement mensuel (€)', amount),
    field('Capital de départ (€)', initial),
    field('Rendement annuel espéré (%)', ret),
    field('Horizon (années)', years),
    isEdit ? el('button', { type: 'button', class: 'btn danger ghost full', text: '🗑 Supprimer le plan',
      onclick: () => { store.deletePlan(p.id); modal.close(); } }) : null,
  ]);

  const modal = openModal(isEdit ? 'Modifier le plan' : 'Nouveau plan', body, {
    onSubmit: () => {
      const payload = {
        label: label.value.trim() || 'Plan',
        amount: parseFloat(amount.value) || 0,
        initial: parseFloat(initial.value) || 0,
        expectedReturn: parseFloat(ret.value) || 0,
        years: parseInt(years.value) || 1,
      };
      if (isEdit) store.updatePlan(p.id, payload); else store.addPlan(payload);
      modal.close();
    },
  });
}

// =========================================================================
// VUE : RÉGLAGES
// =========================================================================
function viewSettings() {
  const wrap = el('section', { class: 'view' });
  wrap.append(el('h1', { text: 'Réglages' }));

  // Synchronisation Google Drive
  wrap.append(driveCard());

  // Sauvegarde manuelle par fichier (complément de la synchro Drive)
  wrap.append(card('Sauvegarde manuelle (fichier)', el('div', {}, [
    el('p', { class: 'muted', text: 'À tout moment, tu peux exporter un fichier de sauvegarde, ou en réimporter un. Utile comme copie de secours en plus de la synchro Google Drive.' }),
    el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: '⬇ Exporter (.json)', onclick: doExport }),
      el('button', { class: 'btn', text: '⬆ Importer un fichier', onclick: doImport }),
    ]),
  ])));

  // Thème
  const themeSel = el('select', { class: 'input' }, [
    el('option', { value: 'auto', text: 'Automatique (système)' }),
    el('option', { value: 'light', text: 'Clair' }),
    el('option', { value: 'dark', text: 'Sombre' }),
  ]);
  themeSel.value = store.getSettings().theme || 'auto';
  themeSel.addEventListener('change', () => { store.updateSettings({ theme: themeSel.value }); applyTheme(); });
  wrap.append(card('Apparence', field('Thème', themeSel)));

  // Catégories
  const catBody = el('div', { class: 'list' });
  store.getCategories().forEach((c) => {
    catBody.append(el('div', { class: 'list-row', onclick: () => categoryModal(c) }, [
      el('div', { class: 'list-icon', style: `background:${c.color}22`, text: c.icon }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: c.name }),
        el('div', { class: 'list-sub', text: (c.type === 'income' ? 'Revenu' : 'Dépense') + (c.monthlyBudget ? ' · budget ' + fmtMoney(c.monthlyBudget) : '') }),
      ]),
      el('span', { class: 'chevron', text: '›' }),
    ]));
  });
  wrap.append(card('Catégories', catBody, el('button', { class: 'btn small', text: '＋ Ajouter', onclick: () => categoryModal() })));

  // Données de démonstration / réinitialisation
  wrap.append(card('Données', el('div', { class: 'row' }, [
    el('button', { class: 'btn ghost', text: 'Charger l’exemple', onclick: () => {
      if (confirm('Remplacer les données actuelles par un jeu d’exemple ?')) store.loadDemo();
    } }),
    el('button', { class: 'btn danger ghost', text: 'Tout effacer', onclick: () => {
      if (confirm('Effacer TOUTES les données ? Cette action est irréversible.')) store.resetAll();
    } }),
  ])));

  const foot = drive.isConfigured()
    ? 'Budget Perso — tes données restent sur ton appareil et, si tu l’actives, dans TON Google Drive privé. Rien n’est partagé publiquement.'
    : 'Budget Perso — application locale, hors-ligne. Aucune donnée n’est envoyée sur Internet.';
  wrap.append(el('p', { class: 'footnote', text: foot }));
  return wrap;
}

// --- Carte de synchronisation Google Drive --------------------------------
function syncDotClass(s) {
  return ({ synced: 'ok', syncing: 'busy', connecting: 'busy', offline: 'warn', error: 'err' })[s] || 'idle';
}

function driveCard() {
  const configured = drive.isConfigured();
  const s = drive.getStatus();
  const body = el('div', {}, []);

  body.append(el('div', { class: 'sync-line' }, [
    el('span', { class: 'sync-dot ' + syncDotClass(s) }),
    el('strong', { text: configured ? drive.statusLabel() : 'Synchro Google Drive non activée' }),
  ]));

  if (!configured) {
    body.append(el('p', { class: 'muted', text: 'Active la synchro pour retrouver tes données sur tous tes appareils (ordinateur, téléphone…) via TON Google Drive. Il te faut un « identifiant client » Google, gratuit — les instructions sont fournies séparément.' }));
    const idInput = el('input', { class: 'input', type: 'text', placeholder: 'xxxx.apps.googleusercontent.com', autocomplete: 'off', spellcheck: 'false' });
    body.append(field('Identifiant client Google (Client ID)', idInput));
    body.append(el('button', { class: 'btn primary', text: 'Activer et se connecter', onclick: async (e) => {
      const id = idInput.value.trim();
      if (!id) { idInput.focus(); return; }
      const btn = e.currentTarget; btn.disabled = true;
      drive.setClientId(id);
      try { await drive.init(); await drive.connect({ silent: false }); }
      catch (err) { alert('Connexion impossible : ' + (err?.message || err)); }
      render();
    } }));
    return card('Synchronisation Google Drive', body);
  }

  if (s === 'disconnected' || s === 'error') {
    body.append(el('button', { class: 'btn primary', text: '🔗 Se connecter à Google Drive', onclick: async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { await drive.connect({ silent: false }); }
      catch (err) { alert('Connexion impossible : ' + (err?.message || err)); }
      render();
    } }));
  }

  if (s === 'synced' || s === 'syncing' || s === 'offline') {
    body.append(el('p', { class: 'muted', text: 'Tes données sont enregistrées dans le fichier « budget-perso.json » de ton Google Drive. Tu peux le déplacer dans le dossier de ton choix : l’app le retrouvera automatiquement.' }));
    body.append(el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: '🔄 Synchroniser maintenant', onclick: async () => { await drive.syncNow(); render(); } }),
      el('button', { class: 'btn ghost', text: 'Se déconnecter', onclick: () => { drive.disconnect(); render(); } }),
    ]));
  }

  // Réglage avancé : changer l'identifiant client
  const advInput = el('input', { class: 'input', type: 'text', value: drive.getClientId(), autocomplete: 'off', spellcheck: 'false' });
  body.append(el('details', { class: 'advanced' }, [
    el('summary', { text: 'Réglage avancé : identifiant client' }),
    el('div', { class: 'advanced-body' }, [
      field('Client ID', advInput),
      el('button', { class: 'btn small', text: 'Enregistrer', onclick: () => { drive.setClientId(advInput.value.trim()); render(); } }),
    ]),
  ]));

  return card('Synchronisation Google Drive', body);
}

function doExport() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const name = `budget-perso-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doImport() {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (confirm('Importer ce fichier remplacera tes données actuelles. Continuer ?')) {
          store.importJSON(reader.result);
          state.view = 'dashboard';
        }
      } catch (e) {
        alert('Fichier invalide : ' + e.message);
      }
    };
    reader.readAsText(file);
  });
  document.body.append(input);
  input.click();
  input.remove();
}

// --- Thème ----------------------------------------------------------------
function applyTheme() {
  const t = store.getSettings().theme || 'auto';
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

// --- Indicateur de synchronisation (badge de la barre latérale) -----------
function updateSyncChip() {
  const badge = document.querySelector('.sidebar-foot .badge');
  if (!badge) return;
  if (!drive.isConfigured()) {
    badge.textContent = '🔒 100 % local';
    badge.className = 'badge';
    return;
  }
  badge.textContent = '☁ ' + drive.statusLabel();
  badge.className = 'badge sync-' + syncDotClass(drive.getStatus());
}

// --- Démarrage ------------------------------------------------------------
store.subscribe(() => render());
applyTheme();
render();

// Synchronisation Google Drive : mise à jour de l'indicateur + initialisation.
// La génération des opérations récurrentes se fait APRÈS la synchro initiale
// (pour partir des données les plus fraîches et éviter tout doublon).
drive.onStatus(() => { updateSyncChip(); if (state.view === 'settings') { /* le statut suffit */ } });
drive.init()
  .catch(() => {})
  .then(() => { store.generateDueRecurrings(); updateSyncChip(); if (state.view === 'settings') render(); });
updateSyncChip();

// Rattraper les échéances quand on revient sur l'app (utile si elle reste ouverte
// plusieurs jours). Léger délai pour laisser la synchro récupérer d'abord le distant.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') setTimeout(() => store.generateDueRecurrings(), 2500);
});

// Enregistrement du service worker (PWA hors-ligne).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW non enregistré :', e));
  });
}

// Bouton d'action flottant (ajout rapide selon la vue).
const fab = document.getElementById('fab');
if (fab) {
  fab.addEventListener('click', () => {
    if (state.view === 'investments') holdingModal();
    else if (state.view === 'plan') planModal();
    else if (state.view === 'budgets') categoryModal();
    else if (state.view === 'recurring') recurringModal();
    else txModal();
  });
}
