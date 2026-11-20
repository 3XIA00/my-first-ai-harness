/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The room server's address in production builds, e.g. https://agent-rooms.onrender.com (ADR-0007). */
  readonly VITE_SERVER_URL?: string;
}
