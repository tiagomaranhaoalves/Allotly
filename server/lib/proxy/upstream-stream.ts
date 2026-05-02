/**
 * Shared upstream-stream consumer used by both M3b's Anthropic-shaped SSE
 * endpoint (`/api/v1/messages`) and M4's MCP `chat` ndjson streaming branch.
 *
 * The consumer reads a `globalThis.Response.body` line-by-line and invokes
 * the caller's `onData` callback with each `data: <payload>` line's payload
 * (the leading `data: ` prefix is stripped). Framing decisions (SSE,
 * ndjson, etc.) live with each caller; this helper only owns:
 *   - bytewise read loop with UTF-8 streaming decode
 *   - newline split + partial-line buffering
 *   - `data:` line extraction
 *   - cooperative AbortSignal cancellation (cancels the reader)
 *
 * The `[DONE]` sentinel is forwarded verbatim — callers decide whether it
 * terminates their stream.
 */

export interface UpstreamStreamHandlers {
  /** Called for each `data: <payload>` line. Payload has the prefix stripped. */
  onData: (rawData: string) => void | Promise<void>;
  /** Called once when an external abort signal fires. Best-effort. */
  onAbort?: () => void;
}

export interface ConsumeUpstreamOptions {
  /** When fired, cancels the underlying reader and returns. */
  signal?: AbortSignal;
}

export async function consumeSseUpstream(
  providerResponse: globalThis.Response,
  handlers: UpstreamStreamHandlers,
  options: ConsumeUpstreamOptions = {},
): Promise<void> {
  const body = providerResponse.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try { reader.cancel(); } catch {}
    try { handlers.onAbort?.(); } catch {}
  };

  if (options.signal) {
    if (options.signal.aborted) {
      onAbort();
      return;
    }
    options.signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data: ")) {
          await handlers.onData(trimmed.slice(6));
        }
      }

      if (aborted) break;
    }

    const tail = buffer.trim();
    if (!aborted && tail.startsWith("data: ")) {
      await handlers.onData(tail.slice(6));
    }
  } finally {
    if (options.signal) options.signal.removeEventListener("abort", onAbort);
  }
}
