import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ModelId } from "../types";

type Tab = "python" | "node" | "curl";

interface Props {
  visible: boolean;
  keyRedacted?: string;
  model?: ModelId;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "node", label: "Node.js" },
  { id: "curl", label: "curl" },
];

function buildSnippet(tab: Tab, key: string, model: string): string {
  if (tab === "python") {
    return `from openai import OpenAI

client = OpenAI(
    base_url="https://allotly.ai/api/v1",
    api_key="${key}",
)

resp = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "..."}],
)`;
  }
  if (tab === "node") {
    return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://allotly.ai/api/v1",
  apiKey: "${key}",
});

const resp = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "..." }],
});`;
  }
  return `curl https://allotly.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{"role":"user","content":"..."}]
  }'`;
}

export function PreflightSnippet({ visible, keyRedacted = "allotly_sk_demo_arena", model = "gpt-4o-mini" }: Props) {
  const [tab, setTab] = useState<Tab>("python");
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const snippet = buildSnippet(tab, keyRedacted, model);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="rounded-lg border border-white/10 bg-black/60 overflow-hidden transition-opacity duration-200"
      data-testid="preflight-snippet"
    >
      <div
        className="border-b border-white/10 bg-white/[0.02] px-3 py-2"
        data-testid="snippet-explainer"
      >
        <div className="text-[11px] uppercase tracking-wide text-indigo-300 font-medium">
          What your developers actually write
        </div>
        <p className="mt-1 text-xs text-white/70 leading-relaxed">
          This is the only code change Allotly asks for: point your existing OpenAI SDK
          (or a plain HTTP call) at <code className="font-mono text-white/85">allotly.ai</code> and
          swap in your Allotly key. Every budget rule, allowlist, and audit log you set up
          gets enforced from here — no model-specific SDKs, no rewrites.
        </p>
      </div>
      <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-3 py-1.5">
        <div className="flex items-center gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 text-[11px] rounded transition ${
                tab === t.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white/80"
              }`}
              data-testid={`tab-snippet-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/40 hidden sm:inline">Same OpenAI SDK · two lines changed</span>
          <button
            onClick={handleCopy}
            className="text-[11px] text-white/60 hover:text-white flex items-center gap-1"
            data-testid="button-copy-snippet"
          >
            {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        </div>
      </div>
      <pre className="px-4 py-3 font-mono text-[11px] leading-relaxed text-white/85 overflow-x-auto whitespace-pre">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
