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

  // Passe 1 : catégoriser chaque VEVENT
  // - rruleBaseVevents  : événement récurrent de base (a RRULE, pas de RECURRENCE-ID)
  // - recurrenceInstances : instance modifiée d'une récurrence (a RECURRENCE-ID)
  // - standaloneVevents  : événement ponctuel ordinaire
  const rruleBaseVevents: ICAL.Component[] = [];
  const recurrenceInstances: ICAL.Component[] = [];
  const standaloneVevents: ICAL.Component[] = [];

  // Ensemble « uid::timestampMs » pour détecter les DTSTART couverts par un RECURRENCE-ID
  const recurrenceIdKeys = new Set<string>();

  for (const vevent of vevents) {
    const uid = vevent.getFirstPropertyValue('uid') as string | null;
    const hasRecurrenceId = Boolean(vevent.getFirstProperty('recurrence-id'));
    const hasRrule = Boolean(vevent.getFirstProperty('rrule'));

    if (hasRecurrenceId) {
      recurrenceInstances.push(vevent);
      if (uid) {
        const ridTime = vevent.getFirstProperty('recurrence-id')!.getFirstValue() as ICAL.Time;
        recurrenceIdKeys.add(`${uid}::${ridTime.toJSDate().getTime()}`);
      }
    } else if (hasRrule) {
      rruleBaseVevents.push(vevent);
    } else {
      standaloneVevents.push(vevent);
    }
  }

  // Passe 2 : éliminer les événements de base RRULE dont le DTSTART est
  // exclu (EXDATE) ou remplacé par une instance RECURRENCE-ID.
  // Google Calendar exporte chaque occurrence modifiée comme RECURRENCE-ID distinct
  // et marque la première occurrence soit avec EXDATE soit avec un RECURRENCE-ID override.
  const survivingRruleVevents: ICAL.Component[] = [];
  for (const vevent of rruleBaseVevents) {
    const uid = vevent.getFirstPropertyValue('uid') as string | null;
    const dtstartProp = vevent.getFirstProperty('dtstart');
    if (!dtstartProp) continue;
    const dtstart = dtstartProp.getFirstValue() as ICAL.Time;
    const dtstartMs = dtstart.toJSDate().getTime();

    // Vérifier EXDATE
    let isExdated = false;
    for (const exProp of vevent.getAllProperties('exdate')) {
      for (const val of (exProp.getValues() as ICAL.Time[])) {
        if (val.toJSDate().getTime() === dtstartMs) {
          isExdated = true;
          break;
        }
      }
      if (isExdated) break;
    }

    // Vérifier si une instance RECURRENCE-ID couvre déjà ce DTSTART
    const isOverridden = uid ? recurrenceIdKeys.has(`${uid}::${dtstartMs}`) : false;

    if (!isExdated && !isOverridden) {
      survivingRruleVevents.push(vevent);
    }
  }

  // Passe 3 : dédupliquer les événements ponctuels + base RRULE survivants par UID/SEQUENCE
  // (gère le cas où Google Calendar conserve un VEVENT STATUS:CANCELLED)
  const dedupMap = new Map<string, { vevent: ICAL.Component; sequence: number }>();
  const noUidVevents: ICAL.Component[] = [];

  for (const vevent of [...standaloneVevents, ...survivingRruleVevents]) {
    const uid = vevent.getFirstPropertyValue('uid') as string | null;
    if (!uid) {
      noUidVevents.push(vevent);
      continue;
    }
    const sequence = (vevent.getFirstPropertyValue('sequence') as number | null) ?? 0;
    const existing = dedupMap.get(uid);
    if (!existing || sequence > existing.sequence) {
      dedupMap.set(uid, { vevent, sequence });
    }
  }

  const sorties: Sortie[] = [];

  const dedupedVevents = [
    ...[...dedupMap.values()].map((e) => e.vevent),
    ...recurrenceInstances,
    ...noUidVevents,
  ];

  for (const vevent of dedupedVevents) {
    // Ignorer les événements supprimés dans Google Calendar (STATUS:CANCELLED au niveau iCal)
    const icalStatus = (vevent.getFirstPropertyValue('status') as string | null)?.toUpperCase();
    if (icalStatus === 'CANCELLED') continue;

    const event = new ICAL.Event(vevent);

    // Identifiant unique par occurrence
    // Pour les instances RECURRENCE-ID, on suffixe avec le timestamp de l'occurrence
    // afin d'éviter les collisions d'ID HTML quand plusieurs instances partagent le même UID.
    const uid =
      (vevent.getFirstPropertyValue('uid') as string | null) ??
      crypto.randomUUID();
    const recurrenceIdProp = vevent.getFirstProperty('recurrence-id');
    const uniqueId = recurrenceIdProp
      ? `${uid}_${(recurrenceIdProp.getFirstValue() as ICAL.Time).toJSDate().getTime()}`
      : uid;

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
    // Remplace les liens pointant vers une image par un <img> :
    // <a href="https://...image.png">...</a>  →  <img src="https://...image.png" alt="image.png" />
    const IMAGE_LINK_RE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+\.(?:png|jpe?g|gif|webp))"[^>]*>.*?<\/a>/gi;
    let descriptionHtml: string | null = null;
    if (descriptionRaw) {
      if (HTML_TAGS_RE.test(descriptionRaw)) {
        descriptionHtml = descriptionRaw;
      } else {
        descriptionHtml = String(marked.parse(descriptionRaw));
      }
      descriptionHtml = descriptionHtml!.replace(IMAGE_LINK_RE, (_, src: string) => {
        const alt = src.split('/').pop() ?? 'image';
        return `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border-radius:6px;" />`;
      });
    }

    sorties.push({
      id: uniqueId,
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
