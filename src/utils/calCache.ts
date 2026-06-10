import ICAL from 'ical.js';
import type { CalEvent } from '@/types/calEvent';

const TORONTO_TZ = 'America/Toronto';
const FETCH_TIMEOUT_MS = 10_000;

const ANNULE_REGEX = /^\[ANNULÉ(?:\s*[-–]\s*([^\]]+))?\]\s*/i;

function parseAnnulation(title: string): {
  isCancelled: boolean;
  cancelReason: string | null;
  cleanTitle: string;
} {
  const match = title.match(ANNULE_REGEX);
  if (!match) return { isCancelled: false, cancelReason: null, cleanTitle: title };
  return {
    isCancelled: true,
    cancelReason: match[1]?.trim() ?? null,
    cleanTitle: title.slice(match[0].length).trim(),
  };
}

/**
 * Détermine le groupe d'un événement selon le jour de la semaine (fuseau Toronto).
 *
 * Stratégie retenue : jour de la semaine uniquement.
 * - Événements multi-jours (all-day, durée ≥ 2 jours) → "2jours"
 * - Lundi → "lundi"
 * - Mercredi → "mercredi"
 * - Autre jour → "tierce"
 *
 * Note : la couleur ICS (X-GOOGLE-CALENDAR-COLOR / COLOR) n'est pas utilisée car
 * elle n'est pas garantie d'être présente dans tous les exports Google Calendar.
 * Le jour de la semaine est un critère fiable pour ce calendrier.
 */
function getGroup(
  startIso: string,
  endIso: string,
  isAllDay: boolean
): CalEvent['group'] {
  if (isAllDay) {
    const [sy, sm, sd] = startIso.split('-').map(Number);
    const [ey, em, ed] = endIso.split('-').map(Number);
    const startMs = new Date(sy, sm - 1, sd).getTime();
    const endMs = new Date(ey, em - 1, ed).getTime();
    if ((endMs - startMs) / 86_400_000 >= 2) return '2jours';
    const dow = new Date(sy, sm - 1, sd).getDay();
    if (dow === 1) return 'lundi';
    if (dow === 3) return 'mercredi';
    return 'tierce';
  }
  const dow = new Intl.DateTimeFormat('en', {
    timeZone: TORONTO_TZ,
    weekday: 'short',
  }).format(new Date(startIso));
  if (dow === 'Mon') return 'lundi';
  if (dow === 'Wed') return 'mercredi';
  return 'tierce';
}

function formatDate(isoStr: string, isAllDay: boolean): string {
  const date = isAllDay ? new Date(isoStr + 'T12:00:00') : new Date(isoStr);
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: TORONTO_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatTime(isoStr: string, isAllDay: boolean): string {
  if (isAllDay) return '';
  const date = new Date(isoStr);
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: TORONTO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  // Format québécois : "18 h 30" ou "18 h 00"
  return `${parts.hour} h ${parts.minute}`;
}

/** Retire toutes les balises HTML et les caractères Markdown courants */
function toPlainText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')        // balises HTML
    .replace(/[*_~`#>[\]|]/g, '')   // Markdown courant
    .replace(/\n{3,}/g, '\n\n')     // espaces vides excessifs
    .trim();
}

function daysUntil(startIso: string, isAllDay: boolean): number {
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  let eventMidnight: number;
  if (isAllDay) {
    const [y, m, d] = startIso.split('-').map(Number);
    eventMidnight = new Date(y, m - 1, d).getTime();
  } else {
    const d = new Date(startIso);
    eventMidnight = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate()
    ).getTime();
  }

  return Math.round((eventMidnight - todayMidnight) / 86_400_000);
}

/**
 * Récupère le flux ICS et retourne les événements normalisés pour OneSignal.
 * Timeout : 10 secondes.
 */
export async function fetchAndParseCalEvents(icsUrl: string): Promise<CalEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let icsText: string;
  try {
    const response = await fetch(icsUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Fetch ICS failed: ${response.status} ${response.statusText}`);
    }
    icsText = await response.text();
  } finally {
    clearTimeout(timer);
  }

  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  // --- Même logique de déduplication que parseIcal.ts ---
  const rruleBaseVevents: ICAL.Component[] = [];
  const recurrenceInstances: ICAL.Component[] = [];
  const standaloneVevents: ICAL.Component[] = [];
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

  const survivingRruleVevents: ICAL.Component[] = [];
  for (const vevent of rruleBaseVevents) {
    const uid = vevent.getFirstPropertyValue('uid') as string | null;
    const dtstartProp = vevent.getFirstProperty('dtstart');
    if (!dtstartProp) continue;
    const dtstart = dtstartProp.getFirstValue() as ICAL.Time;
    const dtstartMs = dtstart.toJSDate().getTime();

    let isExdated = false;
    for (const exProp of vevent.getAllProperties('exdate')) {
      for (const val of exProp.getValues() as ICAL.Time[]) {
        if (val.toJSDate().getTime() === dtstartMs) {
          isExdated = true;
          break;
        }
      }
      if (isExdated) break;
    }

    const isOverridden = uid ? recurrenceIdKeys.has(`${uid}::${dtstartMs}`) : false;
    if (!isExdated && !isOverridden) survivingRruleVevents.push(vevent);
  }

  const dedupMap = new Map<string, { vevent: ICAL.Component; sequence: number }>();
  const noUidVevents: ICAL.Component[] = [];

  for (const vevent of [...standaloneVevents, ...survivingRruleVevents]) {
    const uid = vevent.getFirstPropertyValue('uid') as string | null;
    if (!uid) { noUidVevents.push(vevent); continue; }
    const sequence = (vevent.getFirstPropertyValue('sequence') as number | null) ?? 0;
    const existing = dedupMap.get(uid);
    if (!existing || sequence > existing.sequence) dedupMap.set(uid, { vevent, sequence });
  }

  const dedupedVevents = [
    ...[...dedupMap.values()].map((e) => e.vevent),
    ...recurrenceInstances,
    ...noUidVevents,
  ];

  const events: CalEvent[] = [];

  for (const vevent of dedupedVevents) {
    const icalStatus = (vevent.getFirstPropertyValue('status') as string | null)?.toUpperCase();
    if (icalStatus === 'CANCELLED') continue;

    const event = new ICAL.Event(vevent);

    const uid =
      (vevent.getFirstPropertyValue('uid') as string | null) ?? crypto.randomUUID();
    const recurrenceIdProp = vevent.getFirstProperty('recurrence-id');
    const uniqueUid = recurrenceIdProp
      ? `${uid}_${(recurrenceIdProp.getFirstValue() as ICAL.Time).toJSDate().getTime()}`
      : uid;

    const titleOriginal = (vevent.getFirstPropertyValue('summary') as string | null) ?? '';
    const { isCancelled, cancelReason, cleanTitle } = parseAnnulation(titleOriginal);

    const location = (vevent.getFirstPropertyValue('location') as string | null) ?? '';
    const descriptionRaw = (vevent.getFirstPropertyValue('description') as string | null) ?? '';

    const startTime = event.startDate;
    const endTime = event.endDate;
    const isAllDay = startTime.isDate;

    const startIso = isAllDay
      ? startTime.toString()
      : startTime.toJSDate().toISOString();
    const endIso = endTime
      ? isAllDay
        ? endTime.toString()
        : endTime.toJSDate().toISOString()
      : startIso;

    const group = getGroup(startIso, endIso, isAllDay);
    const days = daysUntil(startIso, isAllDay);

    events.push({
      uid: uniqueUid,
      title: cleanTitle,
      location,
      descriptionRaw,
      descriptionText: toPlainText(descriptionRaw),
      startIso,
      endIso,
      startDateFormatted: formatDate(startIso, isAllDay),
      startTimeFormatted: formatTime(startIso, isAllDay),
      endTimeFormatted: formatTime(endIso, isAllDay),
      group,
      isCancelled,
      cancelReason,
      daysUntil: days,
      isPast: days < 0,
    });
  }

  events.sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
  return events;
}
