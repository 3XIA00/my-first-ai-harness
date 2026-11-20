// The model call: the only file that knows about OpenRouter (ADR-0006 QST-LLM-CLIENT = A).
//
// A plain `fetch` to OpenRouter's chat-completions endpoint, so every byte sent to the model
// and every failure it can produce is visible here. Each failure becomes an LlmError with a
// `kind`, so the harness can explain it in one line instead of crashing.
import type { ConversationTurn } from "./conversation.ts";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

export type LlmErrorKind =
  | "bad-key" // 401: OPENROUTER_KEY wrong or revoked
  | "out-of-credit" // 402: the $10 is used up
  | "rate-limited" // 429: too many requests; try again shortly
  | "provider-down" // 5xx / 502 / 503: OpenRouter or Anthropic having trouble
  | "bad-request" // other 4xx: our request is malformed (a bug on our side)
  | "network" // couldn't reach OpenRouter, or it took too long
  | "empty-reply"; // 200 OK but no text came back

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status: number | undefined;
  // Plain fields rather than constructor-parameter shorthand: that shorthand is TypeScript-only
  // runtime syntax, which Node's native type stripping can't run (docs/TECHNICAL-DEBT.md TD-2).
  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.status = status;
  }
}

export interface LlmConfig {
  apiKey: string;
  model?: string;
  /** Haiku 5.5 at low effort (ADR-0003 QST-AGENT-MODEL). */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  timeoutMs?: number;
}

/** Signature the harness depends on: conversation in, reply text out, may throw LlmError. */
export type GenerateReply = (system: string, conversation: ConversationTurn[]) => Promise<string>;

export function openRouterReplier(config: LlmConfig): GenerateReply {
  return async (system, conversation) => {
    const body = {
      model: config.model ?? DEFAULT_MODEL,
      messages: [{ role: "system", content: system }, ...conversation],
      max_tokens: config.maxTokens ?? 1000,
      reasoning_effort: config.effort ?? "low",
    };

    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          // Optional attribution headers OpenRouter shows on its dashboard.
          "X-Title": "Agent Rooms",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
      });
    } catch (err) {
      throw new LlmError("network", `Couldn't reach OpenRouter: ${(err as Error).message}`);
    }

    const text = await res.text();
    if (!res.ok) {
      const detail = errorDetail(text);
      throw new LlmError(kindFor(res.status), `OpenRouter ${res.status}: ${detail}`, res.status);
    }

    let data: { choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } };
    try {
      data = JSON.parse(text);
    } catch {
      throw new LlmError("provider-down", `OpenRouter returned non-JSON: ${text.slice(0, 200)}`);
    }
    // OpenRouter can report an upstream failure inside a 200 response.
    if (data.error) throw new LlmError("provider-down", `OpenRouter: ${data.error.message ?? "unknown error"}`);
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new LlmError("empty-reply", "The model returned no text.");
    return reply;
  };
}

function kindFor(status: number): LlmErrorKind {
  if (status === 401) return "bad-key";
  if (status === 402) return "out-of-credit";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "provider-down";
  return "bad-request";
}

function errorDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    return parsed.error?.message ?? text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}
