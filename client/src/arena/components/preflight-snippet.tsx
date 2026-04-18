import { useEffect, useState } from "react";

interface Props {
  visible: boolean;
  keyRedacted?: string;
}

export function PreflightSnippet({ visible, keyRedacted = "allotly_sk_***" }: Props) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShow(true);
    } else {
      const t = setTimeout(() => setShow(false), 200);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!show) return null;

  return (
    <div
      className={`rounded-lg border border-white/10 bg-black/50 px-4 py-3 font-mono text-[11px] text-white/80 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      data-testid="preflight-snippet"
      aria-hidden={!visible}
    >
      <div className="text-emerald-300">POST https://allotly.ai/api/v1/chat/completions</div>
      <div className="text-white/70">Authorization: Bearer {keyRedacted}</div>
      <div className="text-white/50">Content-Type: application/json</div>
    </div>
  );
}
