# Cabinet Médical Amidou Dounake — Site web

Site vitrine et outil de gestion de stock du **Cabinet Médical Amidou Dounake**
Banconi Zekenekorobougou, face à la pharmacie Djiguiya au Razel — Bamako, Mali
Tél : 66 88 60 33 / 76 44 40 52

## Contenu

| Page | Rôle |
|---|---|
| `index.html` | Site public : accueil, présentation, services, horaires (avec indicateur ouvert/fermé), prise de rendez-vous via WhatsApp, contact et carte |
| `stock.html` | Espace cabinet protégé par code : articles, entrées/sorties, alertes (stock faible, rupture, péremption < 30 jours), historique, export CSV, sauvegarde/restauration |

HTML/CSS/JavaScript pur, sans dépendance ni étape de build.

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Configuration

`js/config.js` : numéro WhatsApp qui reçoit les rendez-vous et horaires utilisés pour l'indicateur « Ouvert / Fermé ».
Les horaires affichés et les services sont dans `index.html`.

## Gestion de stock — à savoir

- Les données sont stockées dans le navigateur (`localStorage`) : **elles restent sur l'appareil utilisé**.
  Utiliser toujours le même appareil/navigateur, et faire régulièrement une sauvegarde (bouton « Sauvegarder »).
- Le code d'accès est choisi à la première ouverture de `stock.html`. Il protège l'accès sur l'appareil, mais ce n'est pas une sécurité serveur.
- Toute la persistance passe par l'objet `Store` dans `js/stock.js` : pour synchroniser plusieurs appareils, il suffit de le remplacer par un backend (Firebase, Supabase, API Spring Boot…).

## Déploiement (GitHub Pages)

Settings → Pages → Source : branche `main`, dossier `/ (root)`.
