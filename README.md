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

| Action | Dans Google Calendar |
|---|---|
| Créer une sortie | Nouvel événement + ajouter un tag dans la description |
| Spécifier le type | Ajouter `[type:regulier]`, `[type:intensif]` ou `[type:evenement]` dans la description |
| Annuler | Préfixer le titre : `[ANNULÉ]` ou `[ANNULÉ - Météo]` |
| Modifier | Modifier l'événement → visible au prochain chargement |

### Exemple : entraînement intensif

**Titre :** `Entraînement technique — Virages serrés`  
**Description :**
```
[type:intensif]

Atelier de 2h axé sur la technique de freinage et la négociation des virages serrés en single track.

## Ce qu'il faut apporter
- Casque intégral recommandé
- Eau (1.5L minimum)
- Gants
```

Le tag `[type:intensif]` :
- Définit la couleur d'accent de la carte (rouge)
- N'apparaît pas sur le site (auto-supprimé)
- Fonctionne indépendamment de la couleur GCal (flux `.ics` public n'inclut pas les couleurs)

### Types disponibles

| Tag | Couleur d'accent | Utilité |
|---|---|---|
| `[type:regulier]` | Vert | Sorties régulières pour tous |
| `[type:intensif]` | Rouge | Entraînement ciblé / difficile |
| `[type:evenement]` | Bleu | Événements externes / occasionnels |

*Si aucun tag n'est spécifié, le type par défaut est `regulier` (vert).*

## Commandes

```bash
npm run dev      # Serveur local (http://localhost:4321)
npm run build    # Build de production
npm run preview  # Prévisualiser le build
npm run check    # Vérification TypeScript
```