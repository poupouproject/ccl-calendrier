# CCL Montagne Jeunesse — Design du concept · Vue Sorties

**Projet :** Club Cycliste Lévis — Programme Montagne Jeunesse  
**Document :** Conception de la vue calendrier des sorties  
**Version :** 0.1 (POC)  
**Date :** Mai 2026

---

## 1. Contexte

Le Club Cycliste Lévis (CCL) offre un programme Montagne Jeunesse avec des sorties régulières, des entraînements et des événements tiers. La gestion du calendrier se fait actuellement dans Google Calendar. L'objectif est d'exposer ce calendrier sur le site web du CCL de façon claire, toujours à jour, sans intervention technique après la mise en ligne.

---

## 2. Objectifs

- Afficher les sorties du programme Montagne Jeunesse sur le site CCL
- Synchronisation automatique avec Google Calendar (aucune double saisie)
- Distinguer visuellement les types de sorties
- Communiquer clairement les annulations et les raisons
- Intégration native dans le site Astro existant

---

## 3. Source de données

### Calendrier Google Calendar unique

Un seul calendrier Google partagé sert de source de vérité. La couleur individuelle de chaque événement détermine son type — aucun tag dans le titre ni dans la description n'est nécessaire pour la catégorisation.

| Couleur GCal | Type | Audience |
|---|---|---|
| 🟢 Vert (Sauge) | Régulier | Tous les membres |
| 🔴 Rouge (Tomate) | Intensif | Membres sélectionnés |
| 🔵 Bleu (Bleuet) | Événement tiers | Optionnel / informatif |

### Champs utilisés par événement

| Champ GCal | Utilisation dans l'interface |
|---|---|
| Titre | Nom de la sortie |
| Couleur | Type de sortie |
| Lieu | Point de rendez-vous |
| Description | Contenu, instructions, matériel requis — **supporte le Markdown** |
| Date de début / fin | Affichage et tri |

### Markdown dans la description

Les responsables peuvent enrichir la description des événements avec du Markdown standard. Le site rend le Markdown en HTML à l'affichage.

```
**Point de rendez-vous :** Stationnement du parc à 8h30

## Ce qu'il faut apporter
- Casque intégral obligatoire
- Eau (minimum 1.5L)
- Lunch

## Niveau requis
Intermédiaire — maîtrise des virages serrés nécessaire
```

---

## 4. Gestion des annulations

### Convention de titre

Les annulations se gèrent en préfixant le titre de l'événement dans GCal avec `[ANNULÉ]` ou `[ANNULÉ - Raison]`. Aucune autre modification n'est nécessaire.

| Titre dans GCal | Raison affichée |
|---|---|
| `[ANNULÉ] Sortie régulière — Sentier des Loups` | Annulé (sans raison) |
| `[ANNULÉ - Météo] Entraînement intensif` | Annulé · Météo |
| `[ANNULÉ - Terrain] Sortie longue — Corridor` | Annulé · Terrain |

### Rendu visuel

Les événements annulés restent **visibles** dans la liste — les membres voient que la sortie existe mais n'a pas lieu, ce qui évite toute confusion. La carte est visuellement dégradée pour ne pas créer de fausse attente :

- Carte grisée et désaturée
- Barre d'accent rouge en haut
- Titre barré
- Badge rouge avec la raison
- Icône d'avertissement + raison sous le titre
- Modal : bannière rouge en haut de la fiche détail

---

## 5. Architecture technique

### Stack

| Couche | Technologie |
|---|---|
| Framework | Astro (site CCL existant) |
| Hébergement | Vercel |
| Source calendrier | Google Calendar (`.ics` public) |
| Parser iCal | `ical.js` |
| Rendu Markdown | `marked` |
| Mise à jour | SSR avec revalidation — à chaque chargement de page |

### Flux de données

```
Google Calendar (édition)
        ↓
  Flux .ics public
        ↓
  Endpoint Astro  ← src/pages/api/sorties.json.ts
  (fetch + parse)
        ↓
  Composant Astro ← src/components/SortiesJeunesse.astro
  (affichage)
        ↓
  Page Astro      ← src/pages/sorties.astro
```

### Fichiers à créer

```
src/
├── pages/
│   ├── sorties.astro               ← Page principale
│   └── api/
│       └── sorties.json.ts         ← Endpoint SSR : fetch + parse .ics
└── components/
    └── SortiesJeunesse.astro       ← Composant d'affichage des cartes
```

### Endpoint `sorties.json.ts`

Responsabilités :
- Fetch du flux `.ics` public Google Calendar
- Parse avec `ical.js`
- Mapping couleur GCal → type (`regulier` / `intensif` / `evenement`)
- Détection du tag `[ANNULÉ]` dans le titre
- Retour JSON normalisé

### Mise à jour automatique

Le site lit le `.ics` à chaque chargement de page (SSR Vercel). Toute modification dans Google Calendar est visible immédiatement au prochain chargement — aucune action technique requise.

---

## 6. Interface utilisateur

### Structure de la page

```
Header CCL
  └── Logo + titre "Montagne Jeunesse"

Hero
  └── Titre "Prochaines sorties"

Barre de filtres
  ├── Période : À venir / Tout / Passées
  └── Recherche texte libre

Contenu principal (groupé par mois)
  └── Cartes d'événements (grille responsive)

Modal détail (au clic sur une carte)
```

### Carte d'événement

Chaque sortie est représentée par une carte affichant :

- Date (jour prominent + jour de semaine + mois)
- Badge de statut (À venir / Cette semaine / Passée / Annulé)
- Titre de la sortie
- Raison d'annulation si applicable
- Extrait de description (3 lignes max)
- Lieu / Point de rendez-vous
- Footer : groupe d'âge + bouton Détails

### Modal détail

Au clic sur une carte, un panneau modal affiche :

- Bannière d'annulation (si applicable)
- Date complète (avec plage si multi-jours)
- Lieu
- Description complète en Markdown rendu
- Lien vers l'événement Google Calendar

### Traitement des annulations dans l'UI

L'événement annulé reste dans la liste mais est visuellement distingué. La raison est extraite automatiquement du tag dans le titre et affichée sans reformatage. Le titre propre (sans le tag) est utilisé partout dans l'interface.

---

## 7. Identité visuelle

Le style s'appuie sur un registre **dynamique et sportif**, adapté à un programme de vélo de montagne jeunesse.

| Élément | Choix |
|---|---|
| Typographie titres | Barlow Condensed — Black / Bold |
| Typographie corps | Barlow — Regular / Medium |
| Fond | Sombre (#0D1117) |
| Accent principal | Orange (#FF5C1A) |
| Régulier | Vert (#00C853) |
| Intensif | Rouge (#FF3B30) |
| Événement | Bleu (#40A0FF) |
| Annulé | Rouge dégradé (#FF3B30) + désaturation |

---

## 8. Workflow éditorial

Le responsable du programme n'interagit qu'avec **Google Calendar**. Aucune action sur le site n'est requise.

### Créer une sortie
1. Créer un événement dans Google Calendar
2. Assigner la couleur selon le type (vert / rouge / bleu)
3. Remplir le titre, le lieu, la description (Markdown supporté)
4. Enregistrer → visible sur le site au prochain chargement

### Annuler une sortie
1. Ouvrir l'événement dans Google Calendar
2. Préfixer le titre avec `[ANNULÉ - Raison]`
3. Enregistrer → la carte apparaît en mode annulé sur le site

### Modifier une sortie
1. Modifier l'événement dans Google Calendar
2. Enregistrer → changements visibles au prochain chargement

---

## 9. Prochaines étapes

| Priorité | Action |
|---|---|
| 1 | Rendre le calendrier CCL public dans Google Calendar |
| 2 | Récupérer l'URL `.ics` du calendrier |
| 3 | Implémenter l'endpoint `sorties.json.ts` dans le projet Astro |
| 4 | Implémenter le composant `SortiesJeunesse.astro` |
| 5 | Créer la page `sorties.astro` |
| 6 | Tester avec de vraies données |
| 7 | Déploiement sur Vercel |

---

*Document généré dans le cadre du POC CCL Montagne Jeunesse — Solutions Nexvio*
