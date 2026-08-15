/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSFORGE_URL: string
  readonly VITE_INSFORGE_ANON_KEY: string
  readonly VITE_SCHOOL_NAME?: string
  readonly VITE_SCHOOL_SHORT?: string
  readonly VITE_SCHOOL_CITY?: string
  readonly VITE_EMAIL_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
