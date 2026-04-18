import type { MockUI } from "../types";
import type { ReactNode } from "react";

interface Props {
  variant: MockUI;
  title: string;
  contextCopy: string;
  prompt: string;
  children?: ReactNode;
}

export function MockUIFrame({ variant, title, contextCopy, prompt, children }: Props) {
  const chromeColor = {
    gmail: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    linkedin: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    twitter: "bg-sky-500/10 text-sky-300 border-sky-500/20",
    notion: "bg-white/5 text-white/70 border-white/15",
    doc: "bg-amber-500/10 text-amber-200 border-amber-500/20",
    terminal: "bg-emerald-500/10 text-emerald-200 border-emerald-500/20",
  }[variant];

  const label = {
    gmail: "Gmail · Compose",
    linkedin: "LinkedIn · Create a post",
    twitter: "X · New post",
    notion: "Notion · Document",
    doc: "Document · Draft",
    terminal: "Terminal",
  }[variant];

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/60 overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-2 text-xs border-b ${chromeColor}`}>
        <span className="font-medium">{label}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-70">Mock UI</span>
      </div>
      <div className="px-5 py-4">
        <div className="text-white font-semibold">{title}</div>
        <p className="mt-1 text-sm text-white/60">{contextCopy}</p>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/80 whitespace-pre-wrap">
          {prompt}
        </div>
        {children}
      </div>
    </div>
  );
}
