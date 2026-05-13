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
    
    // Pour chaque sortie, afficher la description brute et le type détecté
    const debug = sorties.map(s => ({
      titre: s.titre,
      type: s.type,
      descriptionRaw: s.description ? s.description.slice(0, 200) : null,
      descriptionCharCodes: s.description 
        ? Array.from(s.description.slice(0, 50)).map((c, i) => 
            `${i}: '${c}' (${c.charCodeAt(0)})` 
          ).join(' | ')
        : null,
    }));

    return new Response(JSON.stringify({ count: sorties.length, debug }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
