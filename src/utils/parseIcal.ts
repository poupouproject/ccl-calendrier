import ICAL from 'ical.js';
import { marked } from 'marked';

export type TypeSortie = 'regulier' | 'intensif' | 'evenement' | 'inconnu';

export interface Sortie {
  id: string;
  titre: string;
  titreOriginal: string;
  type: TypeSortie;
  annule: boolean;
  raisonAnnulation: string | null;
  /** "YYYY-MM-DD" pour les événements full-day, ISO 8601 pour les événements avec heure */
  dateDebut: string;
  dateFin: string | null;
  isAllDay: boolean;
  lieu: string | null;
  /** Description brute (Markdown) */
  description: string | null;
  /** Description rendue en HTML */
  descriptionHtml: string | null;
  urlGcal: string | null;
}

/** Couleurs Google Calendar → type de sortie */
const COLOR_TO_TYPE: Record<string, TypeSortie> = {
  sage:       'regulier',
  green:      'regulier',
  basil:      'regulier',
  tomato:     'intensif',
  flamingo:   'intensif',
  tangerine:  'intensif',
  blueberry:  'evenement',
  peacock:    'evenement',
  lavender:   'evenement',
};

const ANNULE_REGEX = /^\[ANNULÉ(?:\s*[-–]\s*([^\]]+))?\]\s*/i;
const TYPE_REGEX = /\[\s*type\s*:\s*(regulier|intensif|evenement)\s*\]/i;

function parseAnnulation(titre: string): {
  annule: boolean;
  raison: string | null;
  titreNettoye: string;
} {
  const match = titre.match(ANNULE_REGEX);
  if (!match) return { annule: false, raison: null, titreNettoye: titre };
  return {
    annule: true,
    raison: match[1]?.trim() ?? null,
    titreNettoye: titre.slice(match[0].length).trim(),
  };
}

/** Extrait le type de sortie depuis un tag [type:XXX] dans la description */
function extractTypeFromDescription(description: string | null): TypeSortie | null {
  if (!description) return null;
  
  const match = description.match(TYPE_REGEX);
  if (!match) return null;
  
  // match[0] = le tag entier ex: "[type:intensif]"
  // match[1] = le type capturé ex: "intensif"
  const typeStr = match[1]?.toLowerCase();
  
  if (!typeStr) return null;
  
  // Valider que c'est bien un des types connus
  if (typeStr === 'regulier' || typeStr === 'intensif' || typeStr === 'evenement') {
    return typeStr as TypeSortie;
  }
  
  return null;
}

/**
 * Récupère et parse le flux .ics public d'un calendrier Google.
 * Retourne les événements triés par date de début (ascendant).
 */
export async function fetchAndParseSorties(icsUrl: string): Promise<Sortie[]> {
  const response = await fetch(icsUrl);
  if (!response.ok) {
    throw new Error(`Impossible de récupérer le calendrier (${response.status} ${response.statusText})`);
  }

  const icsText = await response.text();
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  const sorties: Sortie[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    // Identifiant unique
    const uid =
      (vevent.getFirstPropertyValue('uid') as string | null) ??
      crypto.randomUUID();

    // Titre
    const titreOriginal =
      (vevent.getFirstPropertyValue('summary') as string | null) ?? '';

    // Lieu
    const lieu =
      (vevent.getFirstPropertyValue('location') as string | null) ?? null;

    // Description (brute — peut contenir du Markdown)
    const descriptionRaw =
      (vevent.getFirstPropertyValue('description') as string | null) ?? null;

    // Lien Google Calendar
    const urlGcal =
      (vevent.getFirstPropertyValue('url') as string | null) ?? null;

    // Type de sortie : chercher d'abord un tag [type:XXX] dans la description
    // Fallback : couleur GCal (si disponible), puis défaut à 'regulier'
    let type: TypeSortie = 'regulier';
    const typeFromDesc = extractTypeFromDescription(descriptionRaw);
    if (typeFromDesc) {
      type = typeFromDesc;
    } else {
      const colorRaw = (
        (vevent.getFirstPropertyValue('color') as string | null) ?? ''
      ).toLowerCase();
      if (colorRaw && COLOR_TO_TYPE[colorRaw]) {
        type = COLOR_TO_TYPE[colorRaw];
      }
    }

    // Annulation
    const { annule, raison, titreNettoye } = parseAnnulation(titreOriginal);

    // Dates
    const startTime = event.startDate;
    const endTime = event.endDate;
    const isAllDay = startTime.isDate;

    const dateDebut = isAllDay
      ? startTime.toString()                // "YYYY-MM-DD"
      : startTime.toJSDate().toISOString(); // ISO 8601

    const dateFin = endTime
      ? isAllDay
        ? endTime.toString()
        : endTime.toJSDate().toISOString()
      : null;

    // Markdown → HTML (marked est synchrone par défaut)
    // Nettoyer les tags métadonnées ([type:XXX]) avant rendu
    let descriptionHtml: string | null = null;
    if (descriptionRaw) {
      const cleanedDesc = descriptionRaw.replace(TYPE_REGEX, '').trim();
      if (cleanedDesc) {
        descriptionHtml = String(marked.parse(cleanedDesc));
      }
    }

    sorties.push({
      id: uid,
      titre: titreNettoye,
      titreOriginal,
      type,
      annule,
      raisonAnnulation: raison,
      dateDebut,
      dateFin,
      isAllDay,
      lieu,
      description: descriptionRaw,
      descriptionHtml,
      urlGcal,
    });
  }

  // Tri chronologique
  sorties.sort(
    (a, b) => toTimestamp(a.dateDebut, a.isAllDay) - toTimestamp(b.dateDebut, b.isAllDay)
  );

  return sorties;
}

function toTimestamp(dateStr: string, isAllDay: boolean): number {
  if (isAllDay) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return new Date(dateStr).getTime();
}
