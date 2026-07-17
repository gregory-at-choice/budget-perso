// config.js — Configuration de la synchronisation Google Drive.
//
// GOOGLE_CLIENT_ID : identifiant client OAuth 2.0 (type « Application Web »)
// créé dans la Google Cloud Console. Il n'est PAS secret (il est visible dans
// le code de toute app web) — il sert juste à identifier l'application auprès
// de Google. Laisse la chaîne vide tant que la synchro Drive n'est pas configurée :
// l'app fonctionne alors en mode 100 % local.
//
// Tu peux aussi le renseigner directement depuis l'app (Réglages → Synchronisation
// Google Drive → Réglage avancé), sans modifier ce fichier.
export const GOOGLE_CLIENT_ID = '419396679891-k9k63unegm2aj214iqn8rks91i2c27b3.apps.googleusercontent.com';
