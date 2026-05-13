/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GCAL_ICS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
