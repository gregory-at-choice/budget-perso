# 💰 Budget Perso

Application web (**PWA**) de gestion de budget personnel : suivi des **dépenses**,
**budgets mensuels**, **portefeuille d'investissements** et **plan d'investissement**
avec projection à intérêts composés.

- **Multiplateforme** — un seul code, fonctionne dans le navigateur sur **ordinateur**
  (Windows / macOS / Linux) **et téléphone** (iOS / Android).
- **Installable** — « Ajouter à l'écran d'accueil » : elle s'ouvre plein écran comme
  une vraie app et fonctionne **hors-ligne** (service worker).
- **100 % local & privé** — toutes les données sont stockées dans le navigateur
  (`localStorage`). **Rien n'est envoyé sur Internet.** Sauvegarde/transfert par
  export/import d'un fichier JSON.
- **Sans build, sans dépendance** — HTML / CSS / JavaScript pur. Hébergeable
  gratuitement (GitHub Pages, Netlify, ou n'importe quel serveur statique).

![Aperçu — tableau de bord](docs/preview-dashboard.png)

## Fonctionnalités

| Vue | Contenu |
|-----|---------|
| **Tableau de bord** | Solde du mois, revenus/dépenses, répartition (anneau), tendance 6 mois, patrimoine et performance |
| **Dépenses** | Saisie rapide (dépense / revenu), catégories, filtre par mois, édition/suppression |
| **Budgets** | Budget mensuel par catégorie + suivi de consommation avec barres de progression |
| **Investissements** | Portefeuille (Livret, PEA, Assurance-vie, CTO, Actions/ETF, Crypto, Immo…), plus/moins-values, allocation |
| **Plan** | Versements programmés + **projection à intérêts composés** (courbe versé vs valeur estimée) |
| **Réglages** | Export/Import JSON, thème clair/sombre, gestion des catégories, jeu de démonstration |

## Lancer en local

C'est une PWA : elle doit être servie via **http(s)** (le service worker ne
fonctionne pas en `file://`). Depuis ce dossier :

```bash
cd budget-perso
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(ou tout autre serveur statique : `npx serve`, `php -S localhost:8000`, etc.)

## Déployer (gratuit)

**GitHub Pages** — dans les réglages du dépôt, activer Pages et pointer sur ce dossier
(ou déplacer son contenu à la racine du site publié). L'app est ensuite accessible
depuis n'importe quel appareil, puis **installable** :

- **iPhone / iPad (Safari)** : Partager → « Sur l'écran d'accueil ».
- **Android / Chrome** : menu ⋮ → « Installer l'application ».
- **Ordinateur (Chrome/Edge)** : icône d'installation dans la barre d'adresse.

## Synchroniser entre ordinateur et téléphone

Les données étant **locales à chaque appareil**, la synchronisation se fait par fichier :

1. **Réglages → Exporter (.json)** sur l'appareil source.
2. Transférer le fichier (Google Drive, e-mail, AirDrop…).
3. **Réglages → Importer un fichier** sur l'appareil cible.

> 💡 Pense à exporter régulièrement : effacer les données du navigateur supprime aussi
> celles de l'app. L'export JSON est ta sauvegarde.

## Structure du code

```
budget-perso/
├── index.html            Coquille de l'app + navigation
├── styles.css            Thème clair/sombre, responsive (ordi + mobile)
├── manifest.webmanifest  Métadonnées PWA (installation)
├── sw.js                 Service worker (cache hors-ligne)
├── js/
│   ├── store.js          Données : localStorage, CRUD, export/import, démo
│   ├── ui.js             Formatage (€/dates/%) + graphiques SVG (anneau, barres, courbe)
│   └── app.js            Vues, navigation, formulaires
└── icons/                Icônes de l'app (SVG + PNG)
```

Aucun framework, aucun CDN : tout est autonome et fonctionne hors-ligne.

## Idées d'évolution

- Transactions récurrentes (loyer, abonnements) générées automatiquement.
- Objectifs d'épargne avec échéance.
- Mise à jour des cours (actions/ETF/crypto) via une API au choix.
- Synchronisation cloud optionnelle (chiffrée) pour éviter l'export manuel.
- Catégorisation assistée / import de relevés bancaires (CSV).
