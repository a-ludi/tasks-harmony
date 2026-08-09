/// <reference types="vite/client" />
/// <reference path="../node_modules/@testing-library/jest-dom/types/bun.d.ts" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_BUILD_DATE: string;
  readonly VITE_SYNC_URL: string;
}
