import type { KeyType, ModelId } from "../types";

export interface LiveStreamHandle {
  cancel: () => void;
}

const MODEL_PRICING_PER_MTOK: Record<ModelId, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
};

export function estimateCostUSD(model: ModelId, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING_PER_MTOK[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export interface LiveValidationResult {
  valid: true;
  keyType: KeyType;
  budgetRemainingUSD: number;
  budgetTotalUSD: number;
  expiresAt: string | null;
}

export interface LiveValidationError {
  valid: false;
  status: number;
  message: string;
}

export async function validateAllotlyKey(key: string): Promise<LiveValidationResult | LiveValidationError> {
  try {
    const res = await fetch("/api/v1/keys/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      let message = `Validation failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error?.message) message = body.error.message;
      } catch {
        /* ignore */
      }
      return { valid: false, status: res.status, message };
    }
    const body = await res.json();
    return {
      valid: true,
      keyType: (body.keyType ?? null) as KeyType,
      budgetRemainingUSD: (body.budgetRemainingCents ?? 0) / 100,
      budgetTotalUSD: (body.budgetTotalCents ?? 0) / 100,
      expiresAt: body.expiresAt ?? null,
    };
  } catch (e: any) {
    return { valid: false, status: 0, message: e?.message || "Network error" };
  }
}

export interface LiveStreamResult {
  totalText: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  durationMs: number;
  budgetRemainingUSD: number | null;
  keyType: KeyType;
}

export function streamLiveChatCompletion(args: {
  key: string;
  model: ModelId;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  onDelta: (delta: string) => void;
  onDone: (result: LiveStreamResult) => void;
  onError: (err: { status: number; message: string }) => void;
}): LiveStreamHandle {
  const controller = new AbortController();
  let cancelled = false;

  const messages: Array<{ role: string; content: string }> = [];
  if (args.systemPrompt) messages.push({ role: "system", content: args.systemPrompt });
  messages.push({ role: "user", content: args.userPrompt });

  const start = Date.now();
  let accumulated = "";

  async function run() {
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.key}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: args.model,
          messages,
          stream: true,
          max_tokens: args.maxTokens ?? 400,
        }),
      });

      const keyType = (res.headers.get("X-Allotly-Key-Type") ?? null) as KeyType;
      const budgetRemainingHeader = res.headers.get("X-Allotly-Budget-Remaining");
      const budgetRemainingUSD = budgetRemainingHeader !== null ? parseInt(budgetRemainingHeader, 10) / 100 : null;

      if (!res.ok || !res.body) {
        let message = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error?.message) message = body.error.message;
        } catch {
          /* ignore */
        }
        args.onError({ status: res.status, message });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        if (cancelled) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of event.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                accumulated += delta;
                args.onDelta(delta);
              }
              if (json?.usage) {
                inputTokens = json.usage.prompt_tokens ?? inputTokens;
                outputTokens = json.usage.completion_tokens ?? outputTokens;
              }
            } catch {
              /* skip malformed chunk */
            }
          }
        }
      }

      if (!cancelled) {
        args.onDone({
          totalText: accumulated,
          inputTokens,
          outputTokens,
          costUSD: 0,
          durationMs: Date.now() - start,
          budgetRemainingUSD,
          keyType,
        });
      }
    } catch (e: any) {
      if (!cancelled) args.onError({ status: 0, message: e?.message || "Stream error" });
    }
  }

  void run();

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}
