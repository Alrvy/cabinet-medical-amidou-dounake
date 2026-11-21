# Cabinet Médical Amidou Dounake — Site web et logiciel de gestion

Cabinet Médical Amidou Dounake — Banconi Zekenekorobougou, face à la pharmacie Djiguiya au Razel, Bamako (Mali)
Tél : 66 88 60 33 / 76 44 40 52

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Site public : présentation, services, horaires, prise de rendez-vous (enregistrée en base + WhatsApp), contact |
| `gestion.html` | Logiciel de gestion (connexion obligatoire) : Patients, Rendez-vous, Stock, Utilisateurs |
| `js/gestion/*.js` | Modules du logiciel (`core.js` = noyau commun, un fichier par module) |
| `supabase/schema.sql` | Base : stock, mouvements, rendez-vous |
| `supabase/002_roles_patients.sql` | Rôles du personnel, patients, dossier médical, constantes, consultations, journal |
| `supabase/functions/gerer-utilisateurs/` | Fonction serveur : création et gestion des comptes (réservée à l'admin) |
| `js/config.js` | WhatsApp, horaires, connexion Supabase |

HTML/CSS/JavaScript sans étape de build. Base de données : [Supabase](https://supabase.com) (PostgreSQL).

## Rôles

| Rôle | Accès |
|---|---|
| Administrateur | Tout + création/désactivation des comptes + journal d'activité |
| Médecin | Patients, dossier médical, consultations, constantes, stock, rendez-vous |
| Infirmier(e) | Patients, dossier médical, constantes, stock ; consultations et rendez-vous en lecture |
| Secrétaire | Identité des patients, rendez-vous ; aucun accès au médical ni au stock |

Les droits sont appliqués **par la base de données** (Row Level Security), pas seulement par l'interface.
Personne ne peut s'inscrire seul : seuls les administrateurs créent des comptes (onglet Utilisateurs).

## Installation de la base (dans l'ordre, une seule fois)

1. **SQL Editor** : exécuter `supabase/schema.sql`, puis `supabase/002_roles_patients.sql`.
   Tous les comptes existant au moment de la migration 002 deviennent administrateurs.
2. **Edge Functions → Deploy a new function → Via Editor** : nom `gerer-utilisateurs`, coller
   `supabase/functions/gerer-utilisateurs/index.ts`, **Deploy**.
3. **Authentication → Sign In / Providers** : désactiver *Allow new users to sign up*.
4. `js/config.js` : *Project URL* et clé *publishable* (jamais la clé *secret / service_role*).

## Lancer en local

Double-cliquer sur `index.html` ou `gestion.html`, ou :

```bash
python3 -m http.server 8000
```

## Déploiement (GitHub Pages)

Settings → Pages → Source : branche `main`, dossier `/ (root)`.
