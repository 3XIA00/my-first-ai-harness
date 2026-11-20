// Where the room server lives (ADR-0007).
//
// Development: VITE_SERVER_URL is unset, so URLs are relative to the page, and Vite's proxy
// forwards /api and /ws to the local server (same origin).
// GitHub Pages: the workflow sets VITE_SERVER_URL to the Render address at build time, so
// the page (github.io) talks to the server (onrender.com) across origins.
const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`;
}

export function webSocketUrl(): string {
  const base = SERVER_URL || location.origin;
  return `${base.replace(/^http/, "ws")}/ws`;
}

/** How long before a slow request is explained as the free server waking up. */
export const WAKING_HINT_AFTER_MS = 3_000;
export const WAKING_HINT =
  "Waking up the server (it's on free hosting and sleeps when idle). This can take up to a minute…";
