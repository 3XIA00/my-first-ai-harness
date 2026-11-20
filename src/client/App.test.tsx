// @vitest-environment jsdom
//
// End-to-end tests of the chat page: the real React app rendered in jsdom, talking over a real
// WebSocket to a real room server backed by the Neon dev branch (ADR-0004 QST-TEST-DB).
import type { AddressInfo } from "node:net";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import NodeWebSocket from "ws";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CreateRoomResponse } from "../shared/protocol.ts";
import { createRoomServer, type RoomServer } from "../server/app.ts";
import { createPool, loadEnv, migrate } from "../server/db.ts";
import { App } from "./App.tsx";

declare const jsdom: { reconfigure(options: { url: string }): void };

let pool: pg.Pool;
let app: RoomServer;
let port: number;
const createdRooms: string[] = [];

beforeAll(async () => {
  // Two jsdom gaps, filled to behave like a real browser:
  // - jsdom doesn't implement scrolling. The stand-in returns a Promise *because current Chrome
  //   does*. An earlier no-op returning undefined encoded the very assumption that caused the
  //   M1 blank page, and so hid it (see Regression tests below).
  // - jsdom's own WebSocket breaks under Vitest ("The "event" argument must be an instance of
  //   Event"), so the page uses the `ws` client, which speaks the same browser-style API
  //   (onopen / onmessage with event.data / send / close) over a real socket.
  Element.prototype.scrollIntoView = function scrollIntoView() {
    return Promise.resolve();
  } as unknown as Element["scrollIntoView"];
  globalThis.WebSocket = NodeWebSocket as unknown as typeof WebSocket;
  loadEnv();
  if (!process.env.DEV_BRANCH) {
    throw new Error("Tests need DEV_BRANCH (the Neon dev branch) in .env; refusing to use DATABASE_URL.");
  }
  pool = createPool(process.env.DEV_BRANCH);
  await migrate(pool);
  app = createRoomServer(pool);
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  port = (app.server.address() as AddressInfo).port;
});

afterEach(() => cleanup());

afterAll(async () => {
  await app?.close();
  if (createdRooms.length) await pool.query("DELETE FROM rooms WHERE id = ANY($1)", [createdRooms]);
  await pool?.end();
});

async function openRoomPage(): Promise<string> {
  const res = await fetch(`http://localhost:${port}/api/rooms`, { method: "POST" });
  const { roomId } = (await res.json()) as CreateRoomResponse;
  createdRooms.push(roomId);
  // The page is "served" from the test server's origin, so its WebSocket finds /ws there.
  // Room links are hash routes (ADR-0007), exactly as GitHub Pages will serve them.
  jsdom.reconfigure({ url: `http://localhost:${port}/#/r/${roomId}` });
  return roomId;
}

describe("chat page", () => {
  it("shows the chat after a visitor enters a name and joins, and sends a message", async () => {
    await openRoomPage();
    // StrictMode exactly as main.tsx renders it: React mounts, unmounts, and remounts every
    // effect in development, so the page opens (and closes) an extra WebSocket.
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "3XIA00" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join" })));

    const composer = await screen.findByPlaceholderText("Write a message", {}, { timeout: 10_000 });
    expect(screen.getByText("Copy invite link")).toBeTruthy();

    fireEvent.change(composer, { target: { value: "hello room" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    expect(await screen.findByText("hello room", {}, { timeout: 10_000 })).toBeTruthy();
  });
});

describe("Regression tests", () => {
  it("survives leaving the chat when the browser's scrollIntoView returns a Promise (M1 blank page)", async () => {
    // Bug: 3XIA00 joined a room and the page turned white: "TypeError: destroy is not a
    // function". The scroll effect was written `useEffect(() => ref.current?.scrollIntoView(...))`,
    // so it *returned* scrollIntoView's result. Current Chrome returns a Promise there; React
    // took it as the effect's cleanup and crashed calling it when StrictMode unmounted the
    // chat. Fixed by giving the effect a block body (it returns nothing).
    await openRoomPage();
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Scroller" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join" })));
    await screen.findByPlaceholderText("Write a message", {}, { timeout: 10_000 });

    // Leaving the page runs every effect's cleanup. With the bug, this threw.
    expect(() => view.unmount()).not.toThrow();
  });

  it("joins exactly once and never shows 'Disconnected' when StrictMode remounts the chat (M1 two-tab check)", async () => {
    // Bug (found 2026-11-19 while chasing 3XIA00's "page turned white after Join"):
    // StrictMode mounts the chat, unmounts it, and mounts it again. The first mount's
    // WebSocket was closed while still connecting, which (a) throws/logs "WebSocket is closed
    // before the connection is established", and (b) fires that dead socket's onclose, which
    // could set "Disconnected. Reload the page" *after* the live socket had joined.
    // Fix: cleanup marks the socket disposed; a still-connecting socket closes itself on open
    // without joining; a disposed socket never touches state.
    const roomId = await openRoomPage();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Once" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join" })));
    await screen.findByPlaceholderText("Write a message", {}, { timeout: 10_000 });

    // Give the discarded socket time to connect, close, and (formerly) clobber the status.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1_000)));
    expect(screen.queryByText(/Disconnected/)).toBeNull();

    // Exactly one participant: the discarded socket must not have joined as a ghost.
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM participants WHERE room_id = $1", [
      roomId,
    ]);
    expect(rows[0].n).toBe(1);
  });
});
