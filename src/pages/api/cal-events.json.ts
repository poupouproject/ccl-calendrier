import type { APIRoute } from 'astro';
// Note : @vercel/kv est déprécié par Vercel — migration future vers @upstash/redis directement.
// Conservé ici conformément aux exigences du projet ; à migrer lors d'une prochaine itération.
import { kv } from '@vercel/kv';
import { fetchAndParseCalEvents } from '@/utils/calCache';
import type { CalEvent, CalEventsResponse } from '@/types/calEvent';

const CACHE_KEY = 'ccl_cal_events_v1';
const CACHE_TTL_SECONDS = 600; // 10 minutes

/** Métadonnées enregistrées à côté des événements dans KV */
interface CacheEntry {
  cachedAt: string;
  events: CalEvent[];
}

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60',
};

function respond(body: CalEventsResponse): Response {
  return new Response(JSON.stringify(body), { headers: RESPONSE_HEADERS });
}

/** Vérifie si Vercel KV est configuré (variables d'environnement présentes) */
function isKvConfigured(): boolean {
  return Boolean(
    import.meta.env.KV_REST_API_URL && import.meta.env.KV_REST_API_TOKEN
  );
}

export const GET: APIRoute = async ({ request }) => {
  const icsUrl = import.meta.env.GCAL_ICS_URL;

  if (!icsUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: 'GCAL_ICS_URL non configurée.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const upcomingOnly = url.searchParams.get('upcoming') === 'true';
  const daysParam = url.searchParams.get('days');
  const maxDaysRaw = daysParam ? parseInt(daysParam, 10) : null;
  // Valeurs négatives ou non-numériques sont ignorées
  const maxDays = maxDaysRaw !== null && !isNaN(maxDaysRaw) && maxDaysRaw >= 0 ? maxDaysRaw : null;
  const groupFilter = url.searchParams.get('group');

  let events: CalEvent[] = [];
  let fromCache = false;
  let cachedAt: string | null = null;

  if (isKvConfigured()) {
    // --- Tentative de lecture depuis Vercel KV ---
    try {
      const cached = await kv.get<CacheEntry>(CACHE_KEY);
      if (cached) {
        events = cached.events;
        cachedAt = cached.cachedAt;
        fromCache = true;
      } else {
        // Cache absent ou expiré : fetch + parse
        events = await fetchAndParseCalEvents(icsUrl);
        cachedAt = new Date().toISOString();
        const entry: CacheEntry = { cachedAt, events };
        await kv.setex(CACHE_KEY, CACHE_TTL_SECONDS, entry);
      }
    } catch (kvErr) {
      // Dégradation gracieuse si KV est temporairement indisponible
      console.warn('[cal-events] Vercel KV indisponible, fetch direct :', kvErr);
      try {
        events = await fetchAndParseCalEvents(icsUrl);
      } catch (fetchErr) {
        const message = fetchErr instanceof Error ? fetchErr.message : 'Erreur inconnue';
        return new Response(
          JSON.stringify({ ok: false, error: `Impossible de charger le calendrier : ${message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  } else {
    // --- Mode développement local : KV non configuré, fetch direct ---
    console.warn(
      '[cal-events] KV_REST_API_URL ou KV_REST_API_TOKEN absent — cache désactivé (mode dev).'
    );
    try {
      events = await fetchAndParseCalEvents(icsUrl);
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : 'Erreur inconnue';
      return new Response(
        JSON.stringify({ ok: false, error: `Impossible de charger le calendrier : ${message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // --- Filtres via query params ---
  let filtered = events;

  if (upcomingOnly) {
    filtered = filtered.filter((e) => !e.isPast);
  }

  if (maxDays !== null) {
    filtered = filtered.filter((e) => e.daysUntil >= 0 && e.daysUntil <= maxDays);
  }

  if (groupFilter) {
    filtered = filtered.filter((e) => e.group === groupFilter);
  }

  return respond({
    ok: true,
    cachedAt,
    fromCache,
    count: filtered.length,
    events: filtered,
  });
};
