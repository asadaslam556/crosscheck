/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "static" reads pre-exported JSON from /data instead of calling the API. */
  readonly VITE_DATA_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
