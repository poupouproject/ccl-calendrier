import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  // Mettre à jour avec le vrai domaine avant déploiement
  site: 'https://calendrier.ccl.qc.ca',
});
