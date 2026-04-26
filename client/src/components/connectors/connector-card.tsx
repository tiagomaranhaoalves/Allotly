import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Code2,
  Terminal,
  MessageSquare,
  Bot,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  ALLOTLY_MCP_PACKAGE,
  CONNECTOR_DEEP_LINKS,
  ConnectorId,
  buildSnippet,
} from "@/pages/dashboard/connect-helpers";

const CONNECTOR_ICONS: Record<ConnectorId, React.ComponentType<{ className?: string }>> = {
  cursor: Sparkles,
  vscode: Code2,
  claudeCode: Terminal,
  codex: Bot,
  claudeDesktop: MessageSquare,
};

export interface ConnectorCardProps {
  id: ConnectorId;
  snippetKey: string;
  compact?: boolean;
}

export function ConnectorCard({ id, snippetKey, compact = false }: ConnectorCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const Icon = CONNECTOR_ICONS[id];
  const snippet = buildSnippet(id, { key: snippetKey });
  const deepLink = CONNECTOR_DEEP_LINKS[id];
  const tool = t(`connect.connectors.${id}.title`);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silent
    }
  };

  return (
    <Card
      className={`p-5 flex flex-col gap-3 ${compact ? "" : ""}`}
      data-testid={`card-connector-${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3
              className="font-semibold text-base leading-tight"
              data-testid={`text-connector-title-${id}`}
            >
              {tool}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(`connect.connectors.${id}.bestFor`)}
            </p>
            <Badge
              variant="secondary"
              className="mt-2 font-mono text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate"
            >
              {t(`connect.connectors.${id}.fileHint`)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="relative group">
        <pre
          className={`rounded-md bg-muted/70 dark:bg-muted/40 border p-3 pr-12 overflow-x-auto text-xs font-mono leading-relaxed ${
            compact ? "max-h-72" : "max-h-56"
          }`}
          data-testid={`code-snippet-${id}`}
        >
          {snippet}
        </pre>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={onCopy}
          data-testid={`button-copy-snippet-${id}`}
          aria-label={t("connect.copy")}
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
        {copied && (
          <span
            className="absolute -top-2 right-12 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500 text-white"
            data-testid={`text-copied-${id}`}
          >
            {t("connect.copied")}
          </span>
        )}
      </div>

      {id === "claudeDesktop" && (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`text-caption-${id}`}
        >
          {t("connect.connectors.claudeDesktop.caption", {
            pkg: ALLOTLY_MCP_PACKAGE,
          })}
        </p>
      )}

      {deepLink && (
        <a
          href={deepLink}
          className="text-xs text-primary hover-elevate active-elevate-2 inline-flex items-center gap-1 self-start rounded px-1.5 py-0.5"
          data-testid={`link-open-in-${id}`}
        >
          <ExternalLink className="w-3 h-3" />
          {t("connect.openIn", { tool })}
        </a>
      )}
    </Card>
  );
}
