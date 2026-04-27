import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, MessageSquare, Bot, Sparkles } from "lucide-react";
import type { OAuthConnectorSpec, OAuthConnectorId } from "@shared/connector-snippets";

const ICON_MAP: Record<OAuthConnectorId, React.ComponentType<{ className?: string }>> = {
  claudeAi: MessageSquare,
  chatgpt: Bot,
  gemini: Sparkles,
};

export interface OAuthConnectorCardProps {
  spec: OAuthConnectorSpec;
}

export function OAuthConnectorCard({ spec }: OAuthConnectorCardProps) {
  const [copied, setCopied] = useState(false);
  const Icon = ICON_MAP[spec.id];

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(spec.mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silent
    }
  };

  return (
    <Card
      className="p-5 flex flex-col gap-3"
      data-testid={`card-oauth-connector-${spec.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3
            className="font-semibold text-base leading-tight"
            data-testid={`text-oauth-connector-title-${spec.id}`}
          >
            {spec.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{spec.blurb}</p>
        </div>
      </div>

      <div className="relative">
        <code
          className="block rounded-md bg-muted/70 dark:bg-muted/40 border p-3 pr-12 overflow-x-auto text-xs font-mono leading-relaxed select-all"
          data-testid={`text-oauth-mcp-url-${spec.id}`}
        >
          {spec.mcpUrl}
        </code>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-1.5 right-1.5 h-7 w-7"
          onClick={onCopy}
          data-testid={`button-copy-oauth-url-${spec.id}`}
          aria-label="Copy MCP URL"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      </div>

      <ol
        className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside"
        data-testid={`list-oauth-steps-${spec.id}`}
      >
        {spec.steps.map((step, i) => (
          <li key={i} data-testid={`text-oauth-step-${spec.id}-${i}`}>
            {step}
          </li>
        ))}
      </ol>

      <a
        href={spec.learnMoreUrl}
        className="text-xs text-primary hover-elevate active-elevate-2 inline-flex items-center gap-1 self-start rounded px-1.5 py-0.5"
        data-testid={`link-oauth-learn-more-${spec.id}`}
      >
        <ExternalLink className="w-3 h-3" />
        Learn more
      </a>
    </Card>
  );
}
