import ICAL from 'ical.js';
import { marked } from 'marked';

/** Groupe de sortie déterminé par le jour de la semaine de l'événement */
export type TypeGroupe = 'lundi' | 'mercredi' | 'tierce' | 'deuxjours';

export interface Sortie {
  id: string;
  titre: string;
  titreOriginal: string;
  groupe: TypeGroupe;
  annule: boolean;
  raisonAnnulation: string | null;
  /** "YYYY-MM-DD" pour les événements full-day, ISO 8601 UTC pour les événements avec heure */
  dateDebut: string;
  dateFin: string | null;
  isAllDay: boolean;
  lieu: string | null;
  /** Description brute (Markdown ou HTML selon la source) */
  description: string | null;
  /** Description rendue en HTML */
  descriptionHtml: string | null;
  urlGcal: string | null;
}

const MONTREAL_TZ = 'America/Montreal';

const ANNULE_REGEX = /^\[ANNULÉ(?:\s*[-–]\s*([^\]]+))?\]\s*/i;

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

/**
 * Détermine le groupe d'une sortie selon le jour de la semaine (fuseau Montréal).
 * Événements de 2 jours ou plus (all-day) → 'deuxjours'
 * Lundi → 'lundi', Mercredi → 'mercredi', autre → 'tierce'
 */
function getGroupe(dateStr: string, dateFinStr: string | null, isAllDay: boolean): TypeGroupe {
  if (isAllDay) {
    // Événements de 2 jours ou plus : DTEND exclusif, donc diff >= 2 signifie ≥ 2 jours réels
    if (dateFinStr) {
      const [startYear, startMonth, startDay] = dateStr.split('-').map(Number);
      const [endYear, endMonth, endDay] = dateFinStr.split('-').map(Number);
      const startMs = new Date(startYear, startMonth - 1, startDay).getTime();
      const endMs   = new Date(endYear, endMonth - 1, endDay).getTime();
      const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
      if (diffDays >= 2) return 'deuxjours';
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=dim … 6=sam
    if (dow === 1) return 'lundi';
    if (dow === 3) return 'mercredi';
    return 'tierce';
  }
  // Pour les événements avec heure, le dateStr est une chaîne ISO UTC
  const dow = new Intl.DateTimeFormat('en', {
    timeZone: MONTREAL_TZ,
    weekday: 'short',
  }).format(new Date(dateStr)); // 'Mon', 'Tue', 'Wed', …
  if (dow === 'Mon') return 'lundi';
  if (dow === 'Wed') return 'mercredi';
  return 'tierce';
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

    // Annulation
    const { annule, raison, titreNettoye } = parseAnnulation(titreOriginal);

    // Dates
    const startTime = event.startDate;
    const endTime = event.endDate;
    const isAllDay = startTime.isDate;

    // Pour les événements avec heure, convertir en ISO UTC via toJSDate() pour
    // garantir un affichage correct quel que soit le fuseau du serveur (Vercel = UTC).
    const dateDebut = isAllDay
      ? startTime.toString()          // "YYYY-MM-DD"
      : startTime.toJSDate().toISOString();  // "YYYY-MM-DDTHH:MM:SS.sssZ"

    const dateFin = endTime
      ? isAllDay
        ? endTime.toString()
        : endTime.toJSDate().toISOString()
      : null;

    // Groupe basé sur le jour de la semaine (fuseau Montréal)
    const groupe = getGroupe(dateDebut, dateFin, isAllDay);

    // Markdown → HTML ou HTML passthrough selon le contenu
    // Si la description contient déjà des balises HTML bloc, on l'utilise directement.
    // Sinon, on passe par marked (Markdown → HTML).
    const HTML_TAGS_RE = /<(p|div|br|ul|ol|li|b|i|strong|em|a|h[1-6]|span)\b/i;
    let descriptionHtml: string | null = null;
    if (descriptionRaw) {
      if (HTML_TAGS_RE.test(descriptionRaw)) {
        descriptionHtml = descriptionRaw;
      } else {
        descriptionHtml = String(marked.parse(descriptionRaw));
      }
    }

    sorties.push({
      id: uid,
      titre: titreNettoye,
      titreOriginal,
      groupe,
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
  // Pour les événements avec heure, dateStr est une chaîne ISO UTC
  return new Date(dateStr).getTime();
}
