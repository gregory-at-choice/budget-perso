// store.js — Couche de données « local-first »
// Persistance dans localStorage, CRUD, export/import JSON, pub/sub pour les vues.
// Aucune donnée ne quitte l'appareil : tout est stocké localement dans le navigateur.

const STORAGE_KEY = 'budget-perso.v1';
export const SCHEMA_VERSION = 1;

// Génère un identifiant unique (crypto.randomUUID si dispo, sinon repli).
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Catégories de dépenses/revenus proposées par défaut.
function defaultCategories() {
  return [
    { id: uid(), name: 'Salaire',        type: 'income',  color: '#22c55e', icon: '💼', monthlyBudget: 0 },
    { id: uid(), name: 'Autres revenus', type: 'income',  color: '#14b8a6', icon: '➕', monthlyBudget: 0 },
    { id: uid(), name: 'Logement',       type: 'expense', color: '#6366f1', icon: '🏠', monthlyBudget: 0 },
    { id: uid(), name: 'Courses',        type: 'expense', color: '#f59e0b', icon: '🛒', monthlyBudget: 0 },
    { id: uid(), name: 'Restaurants',    type: 'expense', color: '#ef4444', icon: '🍽️', monthlyBudget: 0 },
    { id: uid(), name: 'Transports',     type: 'expense', color: '#0ea5e9', icon: '🚗', monthlyBudget: 0 },
    { id: uid(), name: 'Loisirs',        type: 'expense', color: '#a855f7', icon: '🎬', monthlyBudget: 0 },
    { id: uid(), name: 'Santé',          type: 'expense', color: '#ec4899', icon: '🩺', monthlyBudget: 0 },
    { id: uid(), name: 'Abonnements',    type: 'expense', color: '#8b5cf6', icon: '📱', monthlyBudget: 0 },
    { id: uid(), name: 'Épargne',        type: 'expense', color: '#10b981', icon: '🐖', monthlyBudget: 0 },
    { id: uid(), name: 'Divers',         type: 'expense', color: '#94a3b8', icon: '📦', monthlyBudget: 0 },
  ];
}

// Classes d'actifs proposées pour les investissements.
export const ASSET_CLASSES = [
  { key: 'livret',  label: 'Livret / Épargne',   color: '#22c55e', icon: '🐖' },
  { key: 'pea',     label: 'PEA',                 color: '#6366f1', icon: '📈' },
  { key: 'av',      label: 'Assurance-vie',       color: '#0ea5e9', icon: '🛡️' },
  { key: 'cto',     label: 'Compte-titres',       color: '#8b5cf6', icon: '📊' },
  { key: 'etf',     label: 'Actions / ETF',       color: '#f59e0b', icon: '🌍' },
  { key: 'crypto',  label: 'Crypto',              color: '#ec4899', icon: '🪙' },
  { key: 'immo',    label: 'Immobilier / SCPI',   color: '#ef4444', icon: '🏢' },
  { key: 'autre',   label: 'Autre',               color: '#94a3b8', icon: '📦' },
];

export function assetClass(key) {
  return ASSET_CLASSES.find((c) => c.key === key) || ASSET_CLASSES[ASSET_CLASSES.length - 1];
}

// État initial d'un nouvel utilisateur (vierge).
function emptyData() {
  return {
    version: SCHEMA_VERSION,
    updatedAt: null, // horodatage ISO de la dernière modification (pour la synchro Drive)
    settings: { currency: 'EUR', locale: 'fr-FR', theme: 'auto' },
    categories: defaultCategories(),
    transactions: [],
    holdings: [],
    plans: [],
  };
}

// --- Persistance ---------------------------------------------------------

let data = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.error('Lecture des données impossible, réinitialisation :', e);
    return emptyData();
  }
}

// Point d'extension pour les futures migrations de schéma.
function migrate(d) {
  if (!d || typeof d !== 'object') return emptyData();
  const base = emptyData();
  return {
    ...base,
    ...d,
    settings: { ...base.settings, ...(d.settings || {}) },
    categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    holdings: Array.isArray(d.holdings) ? d.holdings : [],
    plans: Array.isArray(d.plans) ? d.plans : [],
    updatedAt: d.updatedAt || null,
    version: SCHEMA_VERSION,
  };
}

// Écriture bas niveau : enregistre + notifie les vues, SANS toucher à updatedAt.
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Enregistrement impossible (stockage plein ?) :', e);
    alert('Impossible d’enregistrer : le stockage du navigateur est peut-être plein.');
  }
  listeners.forEach((fn) => fn(data));
}

// Modification par l'utilisateur : on avance l'horodatage puis on enregistre.
function persist() {
  data.updatedAt = new Date().toISOString();
  save();
}

// Applique des données venues de Google Drive : on conserve LEUR updatedAt
// et on n'avance pas l'horodatage (sinon boucle de synchro).
export function applyRemoteData(obj) {
  data = migrate(obj);
  save();
}

// S'abonner aux changements (les vues se re-dessinent).
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getData() {
  return data;
}

export function getSettings() {
  return data.settings;
}

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  persist();
}

// --- Catégories ----------------------------------------------------------

export function getCategories() {
  return data.categories;
}

export function getCategory(id) {
  return data.categories.find((c) => c.id === id);
}

export function addCategory(cat) {
  data.categories.push({ id: uid(), monthlyBudget: 0, ...cat });
  persist();
}

export function updateCategory(id, patch) {
  const c = data.categories.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
  persist();
}

export function deleteCategory(id) {
  data.categories = data.categories.filter((c) => c.id !== id);
  // Les transactions liées deviennent « sans catégorie ».
  data.transactions.forEach((t) => {
    if (t.categoryId === id) t.categoryId = null;
  });
  persist();
}

// --- Transactions --------------------------------------------------------

export function getTransactions() {
  return data.transactions;
}

export function addTransaction(tx) {
  data.transactions.push({ id: uid(), ...tx });
  persist();
}

export function updateTransaction(id, patch) {
  const t = data.transactions.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  persist();
}

export function deleteTransaction(id) {
  data.transactions = data.transactions.filter((t) => t.id !== id);
  persist();
}

// Transactions d'un mois (format "YYYY-MM"), triées de la plus récente à la plus ancienne.
export function transactionsForMonth(month) {
  return data.transactions
    .filter((t) => (t.date || '').slice(0, 7) === month)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// --- Investissements (portefeuille) -------------------------------------

export function getHoldings() {
  return data.holdings;
}

export function addHolding(h) {
  data.holdings.push({ id: uid(), invested: 0, currentValue: 0, ...h });
  persist();
}

export function updateHolding(id, patch) {
  const h = data.holdings.find((x) => x.id === id);
  if (h) Object.assign(h, patch);
  persist();
}

export function deleteHolding(id) {
  data.holdings = data.holdings.filter((h) => h.id !== id);
  persist();
}

// --- Plans d'investissement ---------------------------------------------

export function getPlans() {
  return data.plans;
}

export function addPlan(p) {
  data.plans.push({ id: uid(), ...p });
  persist();
}

export function updatePlan(id, patch) {
  const p = data.plans.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  persist();
}

export function deletePlan(id) {
  data.plans = data.plans.filter((p) => p.id !== id);
  persist();
}

// --- Export / Import / Réinitialisation ----------------------------------

export function exportJSON() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

// Remplace toutes les données par le contenu importé. Renvoie true si succès.
export function importJSON(text) {
  const parsed = JSON.parse(text);
  data = migrate(parsed);
  persist();
  return true;
}

export function resetAll() {
  data = emptyData();
  persist();
}

// Jeu de données de démonstration pour découvrir l'outil.
export function loadDemo() {
  const d = emptyData();
  const cat = (name) => d.categories.find((c) => c.name === name)?.id;
  const now = new Date();
  const ym = (offset) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  };
  const day = (month, d2) => `${month}-${String(d2).padStart(2, '0')}`;

  d.categories.forEach((c) => {
    const budgets = { Logement: 1100, Courses: 450, Restaurants: 200, Transports: 150, Loisirs: 150, Abonnements: 60, Santé: 80, Épargne: 500 };
    if (budgets[c.name]) c.monthlyBudget = budgets[c.name];
  });

  const m0 = ym(0);
  const seed = [
    { m: m0, d: 1, t: 'income', c: 'Salaire', a: 3200, n: 'Salaire' },
    { m: m0, d: 3, t: 'expense', c: 'Logement', a: 1080, n: 'Loyer' },
    { m: m0, d: 5, t: 'expense', c: 'Courses', a: 92.4, n: 'Supermarché' },
    { m: m0, d: 6, t: 'expense', c: 'Abonnements', a: 15.99, n: 'Streaming' },
    { m: m0, d: 8, t: 'expense', c: 'Restaurants', a: 46, n: 'Dîner' },
    { m: m0, d: 10, t: 'expense', c: 'Transports', a: 75, n: 'Carburant' },
    { m: m0, d: 12, t: 'expense', c: 'Courses', a: 63.2, n: 'Marché' },
    { m: m0, d: 14, t: 'expense', c: 'Loisirs', a: 32, n: 'Cinéma' },
    { m: m0, d: 15, t: 'expense', c: 'Épargne', a: 500, n: 'Virement épargne' },
    { m: m0, d: 18, t: 'expense', c: 'Santé', a: 28, n: 'Pharmacie' },
    { m: m0, d: 20, t: 'expense', c: 'Courses', a: 78.5, n: 'Supermarché' },
  ];
  seed.forEach((s) => {
    d.transactions.push({ id: uid(), date: day(s.m, s.d), amount: s.a, type: s.t, categoryId: cat(s.c), note: s.n });
  });

  d.holdings = [
    { id: uid(), name: 'Livret A', class: 'livret', invested: 15000, currentValue: 15300, note: 'Épargne de précaution' },
    { id: uid(), name: 'PEA — MSCI World', class: 'pea', invested: 12000, currentValue: 14200, note: 'ETF World' },
    { id: uid(), name: 'Assurance-vie', class: 'av', invested: 8000, currentValue: 8650, note: 'Fonds euros + UC' },
    { id: uid(), name: 'Bitcoin', class: 'crypto', invested: 2000, currentValue: 3100, note: '' },
  ];

  d.plans = [
    { id: uid(), label: 'Versement PEA', amount: 300, expectedReturn: 6, years: 20, initial: 14200 },
  ];

  data = d;
  persist();
}
