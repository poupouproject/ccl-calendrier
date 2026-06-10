export interface CalEvent {
  /** UID unique de l'événement ICS */
  uid: string;
  /** Titre propre (sans préfixe [ANNULÉ ...]) */
  title: string;
  /** Lieu / point de RDV (vide si absent) */
  location: string;
  /** Description Markdown originale */
  descriptionRaw: string;
  /** Description en texte plain (sans Markdown ni HTML) */
  descriptionText: string;
  /** ISO 8601 ex: "2026-06-08T18:30:00" */
  startIso: string;
  endIso: string;
  /** "lundi 8 juin 2026" */
  startDateFormatted: string;
  /** "18 h 30" */
  startTimeFormatted: string;
  /** "20 h 00" */
  endTimeFormatted: string;
  /** Groupe déterminé par le jour de la semaine de l'événement */
  group: 'lundi' | 'mercredi' | 'tierce' | '2jours' | 'unknown';
  isCancelled: boolean;
  /** Raison extraite de "[ANNULÉ - Raison]" */
  cancelReason: string | null;
  /** Nombre de jours avant l'événement (négatif si passé) */
  daysUntil: number;
  isPast: boolean;
}

export interface CalEventsResponse {
  ok: boolean;
  /** ISO 8601 du moment où le cache a été écrit */
  cachedAt: string | null;
  fromCache: boolean;
  count: number;
  events: CalEvent[];
}
