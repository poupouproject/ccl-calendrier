import type { APIRoute } from 'astro';
import { fetchAndParseSorties } from '@/utils/parseIcal';

export const GET: APIRoute = async () => {
  const icsUrl = import.meta.env.GCAL_ICS_URL;

  if (!icsUrl) {
    return new Response(
      JSON.stringify({ error: 'GCAL_ICS_URL non configurée.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const sorties = await fetchAndParseSorties(icsUrl);
    return new Response(JSON.stringify(sorties), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    return new Response(
      JSON.stringify({ error: `Impossible de charger le calendrier : ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
