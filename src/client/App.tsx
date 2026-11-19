// The chat page. Two screens, chosen by the URL:
//   /          → "Create a room" (you get a link to share)
//   /r/<id>    → pick a name, then chat in that room
import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ChatMessage,
  ClientEvent,
  CreateRoomResponse,
  Participant,
  ServerEvent,
} from "../shared/protocol.ts";

export function App() {
  const roomId = location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)$/)?.[1];
  return roomId ? <Room roomId={roomId} /> : <Home />;
}

function Home() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { roomId } = (await res.json()) as CreateRoomResponse;
      location.assign(`/r/${roomId}`);
    } catch (err) {
      setError(`Couldn't create a room (${String(err)}). Is the server running?`);
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Agent Rooms</h1>
      <p>Create a room, then share its link. Anyone with the link can join.</p>
      <button onClick={createRoom} disabled={busy}>
        {busy ? "Creating…" : "Create a room"}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function Room({ roomId }: { roomId: string }) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  if (!displayName) return <NamePrompt onSubmit={setDisplayName} />;
  return <Chat roomId={roomId} displayName={displayName} />;
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  }
  return (
    <main className="card">
      <h1>Join the room</h1>
      <form onSubmit={submit} className="row">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
        />
        <button type="submit" disabled={!name.trim()}>
          Join
        </button>
      </form>
    </main>
  );
}

function Chat({ roomId, displayName }: { roomId: string; displayName: string }) {
  const [me, setMe] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [draft, setDraft] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/ws`);
    socketRef.current = socket;
    const send = (event: ClientEvent) => socket.send(JSON.stringify(event));

    socket.onopen = () => send({ type: "join", roomId, displayName });
    socket.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as ServerEvent;
      switch (event.type) {
        case "joined":
          setMe(event.participant);
          setMessages(event.history);
          setStatus("");
          break;
        case "message":
          setMessages((prev) => [...prev, event.message]);
          break;
        case "error":
          setStatus(event.error);
          break;
      }
    };
    socket.onclose = () => setStatus("Disconnected. Reload the page to rejoin.");
    return () => socket.close();
  }, [roomId, displayName]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: "send", body } satisfies ClientEvent));
    setDraft("");
  }

  return (
    <main className="chat">
      <header>
        <strong>Room</strong>
        <button
          className="link"
          onClick={() => navigator.clipboard?.writeText(location.href)}
          title="Copy this room's link"
        >
          Copy invite link
        </button>
      </header>
      <ol className="messages">
        {messages.map((m) => (
          <li key={m.id} className={m.participantId === me?.id ? "mine" : m.kind}>
            <span className="who">
              {m.displayName}
              {m.kind === "agent" && " 🤖"}
            </span>
            <span className="body">{m.body}</span>
          </li>
        ))}
        <div ref={bottomRef} />
      </ol>
      {status && <p className="status">{status}</p>}
      <form onSubmit={submit} className="row composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={me ? "Write a message" : "Joining…"}
          disabled={!me}
        />
        <button type="submit" disabled={!me || !draft.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
