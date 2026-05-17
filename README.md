# CCL · Calendrier Montagne Jeunesse

Calendrier des sorties du programme **Montagne Jeunesse** du Club Cycliste Lévis.  
Rendu SSR avec [Astro](https://astro.build), déployé sur [Vercel](https://vercel.com), synchronisé automatiquement depuis Google Calendar via flux `.ics`.

---

## Stack

| Couche | Technologie |
|---|---|
| Framework | Astro 5 (SSR) |
| Hébergement | Vercel |
| Source calendrier | Google Calendar (flux `.ics` public) |
| Parser iCal | `ical.js` |
| Rendu Markdown | `marked` |
| Polices | Barlow Condensed + Barlow (Google Fonts) |

## Structure

```
src/
├── config/
│   └── siteConfig.ts          # Constantes du site (nom, URL, locale…)
├── layouts/
│   └── MainLayout.astro       # Coquille HTML avec SEO, polices, header
├── pages/
│   ├── index.astro            # Redirection → /sorties
│   ├── sorties.astro          # Page principale (SSR)
│   └── api/
│       └── sorties.json.ts    # Endpoint JSON (SSR)
├── components/
│   └── SortiesJeunesse.astro  # Composant UI : cartes + filtres + modales
├── utils/
│   └── parseIcal.ts           # Fetch + parse du flux .ics
└── styles/
    └── global.css             # Variables CSS + reset
```

## Démarrage local

```bash
# Copier les variables d'environnement
cp .env.example .env

# Renseigner GCAL_ICS_URL dans .env
# (URL .ics publique du calendrier Google Calendar)

npm install
npm run dev
```

## Déploiement Vercel

1. Connecter le dépôt GitHub à Vercel
2. Dans **Settings → Environment Variables**, ajouter :
   - `GCAL_ICS_URL` → URL `.ics` publique du calendrier (voir `.env.example`)
3. Déployer — le calendrier se met à jour à chaque chargement de page

### Récupérer l'URL `.ics`

1. Ouvrir [Google Calendar](https://calendar.google.com)
2. Paramètres du calendrier → **Intégrer le calendrier**
3. Copier l'URL sous **Adresse au format iCal** (`basic.ics`)
4. Vérifier que le calendrier est **public** (Paramètres → Autorisations d'accès)

## Convention éditoriale

Le site synchronise automatiquement tous les événements du calendrier Google Calendar public. Aucune configuration manuelle requise.

### Groupes (automatiques basés sur le jour)

Les événements sont classés par **jour de la semaine** du fuseau Montréal :

| Jour | Groupe | Badge |
|---|---|---|
| Lundi | `lundi` | Bleu |
| Mercredi | `mercredi` | Vert |
| Autres (mardi, jeudi, vendredi, etc.) | `tierce` | Orange |
| Événement 2+ jours | `deuxjours` | Jaune |

Les groupes s'affichent en filtres dans l'interface pour organiser les sorties.

### Annuler une sortie

Pour annuler un événement, **préfixer le titre** dans Google Calendar :
- `[ANNULÉ]` — annulation simple
- `[ANNULÉ - Météo]` — avec raison (affichée dans les détails)

L'événement reste visible dans le calendrier avec un badge **Annulé** et un style barré.

### Images dans la description

Les liens vers des images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) sont **automatiquement convertis** en balises `<img>` :

```html
<!-- Google Calendar -->
<a href="https://example.com/map.png">https://example.com/map.png</a>

<!-- Rendu sur le site →-->
<img src="https://example.com/map.png" alt="map.png" style="max-width:100%;height:auto;border-radius:6px;" />
```

### Mise en forme (Markdown ou HTML)

- **Markdown** : Supporté natif (titres, listes, gras, liens…)
- **HTML brut** : Passthrough direct (utile pour les listes complexes)
- **Émojis** : Fonctionnent dans les titres et descriptions

---

## Déduplication & récurrences

Le système gère intelligemment les événements récurrents via `RRULE` et les exceptions `RECURRENCE-ID` :

- **Événements de base** (`RRULE`) : Gardés si non exclu par `EXDATE`
- **Instances modifiées** (`RECURRENCE-ID`) : Toutes conservées avec IDs uniques
- **Vrais doublons** (même UID, SEQUENCE différent) : Celui avec `SEQUENCE` max gardé
- **Événements STATUS:CANCELLED** : Filtrés automatiquement

## Commandes

```bash
npm run dev      # Serveur local (http://localhost:4321)
npm run build    # Build de production
npm run preview  # Prévisualiser le build
npm run check    # Vérification TypeScript
```