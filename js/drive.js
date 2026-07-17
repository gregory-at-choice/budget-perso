// drive.js — Synchronisation avec Google Drive (100 % côté navigateur).
//
// Principe : l'app stocke tes données dans un unique fichier `budget-perso.json`
// placé dans TON Google Drive. Depuis n'importe quel appareil, tu te connectes
// avec Google et l'app lit/écrit ce fichier. La copie locale (localStorage) sert
// de cache : l'app marche hors-ligne et se resynchronise en revenant en ligne.
//
// Sécurité : on demande UNIQUEMENT la permission `drive.file` → l'app ne peut voir
// que le fichier qu'elle a elle-même créé, jamais le reste de ton Drive.

import * as store from './store.js';
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'budget-perso.json';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const LS_CLIENT_ID = 'budget-perso.drive.clientId';
const LS_CONNECTED = 'budget-perso.drive.connected';
const LS_FILE_ID = 'budget-perso.drive.fileId';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let fileId = localStorage.getItem(LS_FILE_ID) || null;
let lastSyncedJSON = null;
let saveTimer = null;
let refreshTimer = null;    // minuteur de rafraîchissement anticipé du jeton
let wired = false;         // les abonnements ne sont posés qu'une fois
let applyingRemote = false; // vrai pendant qu'on applique les données distantes
let status = 'disabled'; // disabled | disconnected | connecting | syncing | synced | offline | error
const statusListeners = new Set();

// --- Configuration --------------------------------------------------------
export function getClientId() {
  return (localStorage.getItem(LS_CLIENT_ID) || GOOGLE_CLIENT_ID || '').trim();
}
export function setClientId(id) {
  if (id && id.trim()) localStorage.setItem(LS_CLIENT_ID, id.trim());
  else localStorage.removeItem(LS_CLIENT_ID);
  tokenClient = null; // forcer la recréation avec le nouvel identifiant
}
export function isConfigured() {
  return !!getClientId();
}

// --- Statut (pour l'UI) ---------------------------------------------------
export function getStatus() { return status; }
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(s) { status = s; statusListeners.forEach((fn) => { try { fn(s); } catch (e) {} }); }

export function statusLabel() {
  return ({
    disabled:     'Synchro non configurée',
    disconnected: 'Non connecté',
    connecting:   'Connexion…',
    syncing:      'Synchronisation…',
    synced:       'Synchronisé',
    offline:      'Hors-ligne (modifs locales)',
    error:        'Erreur de synchro',
  })[status] || status;
}

// --- Chargement de la bibliothèque Google Identity Services ---------------
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Chargement de Google impossible')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Chargement de Google impossible (connexion Internet ?)'));
    document.head.append(s);
  });
}

async function ensureTokenClient() {
  await loadGIS();
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: getClientId(),
      scope: SCOPE,
      callback: () => {}, // défini à chaque demande de jeton
    });
  }
}

function requestToken({ silent }) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp && resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000);
      scheduleTokenRefresh();
      resolve(resp);
    };
    tokenClient.error_callback = (err) => reject(err instanceof Error ? err : new Error(err?.type || 'auth_error'));
    try {
      tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
    } catch (e) { reject(e); }
  });
}

// Rafraîchit le jeton en arrière-plan ~5 min avant son expiration, en boucle,
// pour garder la connexion active tant que l'app est ouverte (sans clic).
function scheduleTokenRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ms = Math.max(30000, tokenExpiry - Date.now() - 300000);
  refreshTimer = setTimeout(() => {
    ensureTokenClient()
      .then(() => requestToken({ silent: true }))
      .catch(() => { /* on retentera au retour sur l'app ou à la prochaine action */ });
  }, ms);
}

async function getToken() {
  // Marge de 2 min : on renouvelle avant l'expiration réelle.
  if (accessToken && Date.now() < tokenExpiry - 120000) return accessToken;
  await ensureTokenClient();
  await requestToken({ silent: true });
  return accessToken;
}

// --- Appels REST à l'API Drive -------------------------------------------
async function api(url, opts = {}, retry = true) {
  const token = await getToken();
  const resp = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  // Jeton expiré/révoqué → on en redemande un silencieusement et on réessaie une fois.
  if (resp.status === 401 && retry) {
    accessToken = null;
    await ensureTokenClient();
    await requestToken({ silent: true });
    return api(url, opts, false);
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Drive API ${resp.status} ${txt}`);
  }
  return resp;
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const resp = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&pageSize=5`);
  const data = await resp.json();
  return data.files && data.files[0] ? data.files[0].id : null;
}

async function downloadFile(id) {
  const resp = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return resp.json();
}

async function createFile(contentObj) {
  const metadata = { name: FILE_NAME, mimeType: 'application/json' };
  const boundary = 'bp' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(contentObj) +
    `\r\n--${boundary}--`;
  const resp = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await resp.json();
  return data.id;
}

async function updateFile(id, contentObj) {
  await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contentObj),
  });
}

// --- Logique de synchronisation ------------------------------------------
function isEmptyData(d) {
  return (!d.transactions || !d.transactions.length)
    && (!d.holdings || !d.holdings.length)
    && (!d.plans || !d.plans.length);
}

// Première synchro après connexion : décide qui, du local ou du distant, gagne.
async function initialSync() {
  setStatus('syncing');
  if (!fileId) fileId = await findFile();

  if (fileId) {
    let remote = null;
    try { remote = await downloadFile(fileId); } catch (e) { remote = null; }
    const local = store.getData();
    const remoteTime = (remote && remote.updatedAt) || '';
    const localTime = local.updatedAt || '';

    if (remote && !isEmptyData(remote) && (remoteTime >= localTime || isEmptyData(local))) {
      // Le distant est plus récent (ou le local est vide) → on adopte le distant.
      applyingRemote = true;
      store.applyRemoteData(remote);
      applyingRemote = false;
      lastSyncedJSON = JSON.stringify(store.getData());
    } else {
      // Le local est plus récent (ou le distant est vide) → on pousse le local.
      await updateFile(fileId, local);
      lastSyncedJSON = JSON.stringify(local);
    }
  } else {
    // Aucun fichier distant → on le crée à partir du local.
    fileId = await createFile(store.getData());
    lastSyncedJSON = JSON.stringify(store.getData());
  }
  if (fileId) localStorage.setItem(LS_FILE_ID, fileId);
  setStatus('synced');
}

// Envoi (débuté) des changements locaux vers Drive.
function scheduleSave() {
  if (applyingRemote) return;
  if (status === 'disabled' || status === 'disconnected' || status === 'connecting') return;
  const currentJSON = JSON.stringify(store.getData());
  if (currentJSON === lastSyncedJSON) return; // rien de neuf (ou on vient d'appliquer le distant)
  if (saveTimer) clearTimeout(saveTimer);
  setStatus('syncing');
  saveTimer = setTimeout(() => { pushNow().catch(() => {}); }, 1500);
}

async function pushNow() {
  const contentObj = store.getData();
  const json = JSON.stringify(contentObj);
  if (!navigator.onLine) { setStatus('offline'); return; }
  try {
    if (!fileId) fileId = await findFile();
    if (fileId) await updateFile(fileId, contentObj);
    else { fileId = await createFile(contentObj); localStorage.setItem(LS_FILE_ID, fileId); }
    lastSyncedJSON = json;
    setStatus('synced');
  } catch (e) {
    console.error('Envoi Drive échoué :', e);
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

// Synchro bidirectionnelle : récupère le distant ET envoie le local, en réconciliant.
// - Si le local n'a pas de modif en attente → on adopte simplement le distant s'il diffère.
// - Sinon (conflit) → le plus récent (updatedAt) l'emporte.
async function resync() {
  // On tente même si le statut est « déconnecté » : c'est ce qui permet la
  // reconnexion silencieuse automatique quand on revient sur l'app.
  if (!isConfigured() || localStorage.getItem(LS_CONNECTED) !== '1') return;
  if (status === 'connecting') return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  // S'assurer d'un jeton valide (rafraîchissement silencieux).
  try { await getToken(); } catch (e) { setStatus('disconnected'); return; }

  setStatus('syncing');
  try {
    if (!fileId) fileId = await findFile();
    const localJSON = JSON.stringify(store.getData());
    const localDirty = localJSON !== lastSyncedJSON; // modifs locales pas encore envoyées

    let remote = null;
    if (fileId) remote = await downloadFile(fileId).catch(() => null);

    if (!fileId || !remote) {
      // Pas de fichier distant → on le crée / on pousse le local.
      if (!fileId) { fileId = await createFile(store.getData()); localStorage.setItem(LS_FILE_ID, fileId); }
      else { await updateFile(fileId, store.getData()); }
      lastSyncedJSON = localJSON;
      setStatus('synced');
      return;
    }

    const remoteJSON = JSON.stringify(remote);
    const remoteTime = remote.updatedAt || '';
    const localTime = store.getData().updatedAt || '';

    if (!localDirty) {
      // Local propre → on adopte le distant s'il a changé.
      if (remoteJSON !== localJSON && !isEmptyData(remote)) {
        applyingRemote = true; store.applyRemoteData(remote); applyingRemote = false;
        lastSyncedJSON = JSON.stringify(store.getData());
      }
    } else if (remoteTime > localTime && !isEmptyData(remote)) {
      // Conflit, le distant est plus récent → il gagne.
      applyingRemote = true; store.applyRemoteData(remote); applyingRemote = false;
      lastSyncedJSON = JSON.stringify(store.getData());
    } else {
      // Conflit, le local est plus récent (ou distant vide) → on pousse le local.
      await updateFile(fileId, store.getData());
      lastSyncedJSON = localJSON;
    }
    setStatus('synced');
  } catch (e) {
    console.error('Resync échoué :', e);
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

// Récupère la dernière version quand on revient sur l'app (onglet visible / focus).
let resyncTimer = null;
function scheduleResync() {
  if (!isConfigured() || localStorage.getItem(LS_CONNECTED) !== '1') return;
  if (status === 'connecting' || status === 'syncing') return;
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => { resync().catch(() => {}); }, 300);
}

// --- API publique ---------------------------------------------------------

// À appeler au démarrage de l'app (et après avoir renseigné le Client ID).
// Idempotent : les abonnements ne sont posés qu'une seule fois.
export async function init() {
  if (!wired) {
    store.subscribe(() => scheduleSave());
    window.addEventListener('online', () => { if (status === 'offline') scheduleSave(); else scheduleResync(); });
    // Récupérer les changements de l'autre appareil quand on revient sur l'app.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleResync(); });
    window.addEventListener('focus', () => scheduleResync());
    wired = true;
  }
  if (!isConfigured()) { setStatus('disabled'); return; }
  setStatus('disconnected');
  // Précharger la bibliothèque Google pour que le clic « Se connecter » ouvre la
  // fenêtre immédiatement (sinon le navigateur peut bloquer la pop-up).
  ensureTokenClient().catch(() => {});
  // Reconnexion silencieuse si l'utilisateur s'était déjà connecté.
  if (localStorage.getItem(LS_CONNECTED) === '1') {
    try { await connect({ silent: true }); }
    catch (e) { setStatus('disconnected'); }
  }
}

export async function connect({ silent = false } = {}) {
  if (!isConfigured()) throw new Error('Identifiant client Google non configuré.');
  setStatus('connecting');
  try {
    await ensureTokenClient();
    await requestToken({ silent });
    localStorage.setItem(LS_CONNECTED, '1');
    await initialSync();
  } catch (e) {
    setStatus('disconnected');
    throw e;
  }
}

export function disconnect() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
  }
  accessToken = null; tokenExpiry = 0;
  localStorage.removeItem(LS_CONNECTED);
  setStatus('disconnected');
}

// Force une synchro manuelle bidirectionnelle (bouton « Synchroniser maintenant »).
export async function syncNow() {
  await resync();
}
