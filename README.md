# Cabinet Médical Amidou Dounake — Site web

Site vitrine et espace de gestion du **Cabinet Médical Amidou Dounake**
Banconi Zekenekorobougou, face à la pharmacie Djiguiya au Razel — Bamako, Mali
Tél : 66 88 60 33 / 76 44 40 52

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Site public : accueil, présentation, services, horaires (indicateur ouvert/fermé), prise de rendez-vous (enregistrée en base + envoyée par WhatsApp), contact et carte |
| `stock.html` | Espace cabinet (connexion e-mail / mot de passe) : stock, entrées/sorties, alertes (stock faible, rupture, péremption < 30 j), historique, export CSV, gestion des rendez-vous |
| `supabase/schema.sql` | Tables, fonction de mouvement de stock et règles de sécurité de la base |
| `js/config.js` | Numéro WhatsApp, horaires, connexion Supabase |

HTML/CSS/JavaScript sans étape de build. Base de données : [Supabase](https://supabase.com) (PostgreSQL, offre gratuite).

## Mise en place de la base (une seule fois)

1. Créer un projet sur supabase.com (région la plus proche : Europe).
2. **SQL Editor → New query** : coller le contenu de `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user** : créer le compte du docteur (e-mail + mot de passe, cocher *Auto Confirm User*).
4. **Authentication → Sign In / Providers** : désactiver *Allow new users to sign up* (seuls les comptes créés à l'étape 3 peuvent se connecter).
5. **Project Settings → API** : copier *Project URL* et la clé *anon / publishable* dans `js/config.js` (`supabaseUrl`, `supabaseAnonKey`).
   ⚠️ Ne jamais mettre la clé *service_role / secret* dans le code.

## Sécurité

- Les visiteurs peuvent seulement **créer** une demande de rendez-vous ; ils ne peuvent rien lire.
- Le stock, l'historique et les rendez-vous ne sont accessibles qu'au personnel connecté (Row Level Security).
- Une sortie de stock supérieure à la quantité disponible est refusée par la base.

## Lancer en local

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Sous Windows, double-cliquer sur `index.html` fonctionne aussi.

## Déploiement (GitHub Pages)

Settings → Pages → Source : branche `main`, dossier `/ (root)`.
