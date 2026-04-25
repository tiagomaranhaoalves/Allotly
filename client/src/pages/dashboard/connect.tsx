import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plug,
  PlugZap,
  Eye,
  EyeOff,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Wifi,
  ChevronDown,
  Key as KeyIcon,
  Sparkles,
  Code2,
  MessageSquare,
} from "lucide-react";
import {
  ALLOTLY_MCP_PACKAGE,
  ALLOTLY_MCP_URL,
  CONNECTOR_DEEP_LINKS,
  CONNECTOR_IDS,
  ConnectorId,
  buildSnippet,
  cleanPrefix,
  isValidFullKey,
  maskKey,
  runTestConnection,
  TestResult,
} from "./connect-helpers";

interface MyKey {
  id: string;
  keyPrefix: string;
  status: "ACTIVE" | "REVOKED" | string;
  lastUsedAt: string | null;
  createdAt: string;
}

const SNIPPET_PLACEHOLDER_TOKEN = "<paste-your-allotly-key>";

const CONNECTOR_ICONS: Record<ConnectorId, React.ComponentType<{ className?: string }>> = {
  cursor: Sparkles,
  vscode: Code2,
  claudeCode: Terminal,
  claudeDesktop: MessageSquare,
};

function useQueryParam(name: string): string | null {
  const [search, setSearch] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.location.search,
  );
  useEffect(() => {
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return new URLSearchParams(search).get(name);
}

function pickDefaultKeyId(keys: MyKey[], queryKeyId: string | null): string | null {
  if (!keys.length) return null;
  if (queryKeyId && keys.some((k) => k.id === queryKeyId && k.status === "ACTIVE")) {
    return queryKeyId;
  }
  const active = keys.filter((k) => k.status === "ACTIVE");
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => {
    const av = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : new Date(a.createdAt).getTime();
    const bv = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : new Date(b.createdAt).getTime();
    return bv - av;
  });
  return sorted[0].id;
}

export default function ConnectPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryKeyId = useQueryParam("key");

  const { data: keys, isLoading } = useQuery<MyKey[]>({ queryKey: ["/api/my-keys"] });
  const activeKeys = useMemo(
    () => (keys ?? []).filter((k) => k.status === "ACTIVE"),
    [keys],
  );

  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [fullKeyInput, setFullKeyInput] = useState("");
  const [masked, setMasked] = useState(false);
  const [copiedConnector, setCopiedConnector] = useState<ConnectorId | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (selectedKeyId === null && activeKeys.length > 0) {
      setSelectedKeyId(pickDefaultKeyId(activeKeys, queryKeyId));
    }
  }, [activeKeys, queryKeyId, selectedKeyId]);

  const selectedKey = activeKeys.find((k) => k.id === selectedKeyId) ?? null;
  const selectedPrefix = selectedKey?.keyPrefix ?? "";
  const fullKeyMatches =
    fullKeyInput.length > 0 && selectedPrefix.length > 0
      ? isValidFullKey(fullKeyInput, selectedPrefix)
      : false;

  const visibleKey = useMemo(() => {
    if (fullKeyMatches) {
      return masked ? maskKey(fullKeyInput) : fullKeyInput;
    }
    if (selectedPrefix && masked) {
      return `${cleanPrefix(selectedPrefix)}•••••`;
    }
    return SNIPPET_PLACEHOLDER_TOKEN;
  }, [fullKeyMatches, masked, fullKeyInput, selectedPrefix]);

  const snippetKey = visibleKey;

  const onCopy = async (connector: ConnectorId, snippet: string) => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedConnector(connector);
      setTimeout(() => {
        setCopiedConnector((c) => (c === connector ? null : c));
      }, 2000);
    } catch {
      // clipboard not available — silent
    }
  };

  const onTest = async () => {
    if (!fullKeyMatches) return;
    setTesting(true);
    setTestResult(null);
    setShowRaw(false);
    const result = await runTestConnection(fullKeyInput);
    setTestResult(result);
    setTesting(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="space-y-2">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-[28rem]" />
        </div>
        <Skeleton className="h-24" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (activeKeys.length === 0) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-connect-heading"
          >
            {t("connect.title")}
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-connect-subtitle">
            {t("connect.subtitle")}
          </p>
        </div>
        <EmptyState
          icon={<KeyIcon className="w-10 h-10 text-muted-foreground" />}
          title={t("connect.noKeysState.title")}
          description={t("connect.noKeysState.description")}
          action={{
            label: t("connect.noKeysState.cta"),
            onClick: () => setLocation("/dashboard/keys"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight flex items-center gap-2"
          data-testid="text-connect-heading"
        >
          <PlugZap className="w-6 h-6 text-primary" />
          {t("connect.title")}
        </h1>
        <p className="text-muted-foreground mt-1" data-testid="text-connect-subtitle">
          {t("connect.subtitle")}
        </p>
      </div>

      <Card className="p-5" data-testid="card-key-selector">
        <div className="grid md:grid-cols-[minmax(0,18rem)_1fr] gap-5 items-start">
          <div className="space-y-2">
            <Label
              htmlFor="connect-key-select"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t("connect.keySelector.label")}
            </Label>
            <Select
              value={selectedKeyId ?? undefined}
              onValueChange={(v) => {
                setSelectedKeyId(v);
                setFullKeyInput("");
                setTestResult(null);
              }}
            >
              <SelectTrigger
                id="connect-key-select"
                data-testid="select-connect-key"
                className="font-mono text-sm"
              >
                <SelectValue placeholder={t("connect.keySelector.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {activeKeys.map((k) => (
                  <SelectItem
                    key={k.id}
                    value={k.id}
                    data-testid={`select-connect-key-option-${k.id}`}
                    className="font-mono text-sm"
                  >
                    {k.keyPrefix}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="connect-full-key"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t("connect.fullKey.label")}
            </Label>
            <Input
              id="connect-full-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("connect.fullKey.placeholder")}
              value={fullKeyInput}
              onChange={(e) => {
                setFullKeyInput(e.target.value.trim());
                setTestResult(null);
              }}
              className="font-mono text-sm"
              data-testid="input-connect-full-key"
            />
            <p className="text-xs text-muted-foreground" data-testid="text-connect-fullkey-help">
              {t("connect.fullKey.help")}
            </p>
            {fullKeyInput.length > 0 && (
              fullKeyMatches ? (
                <p
                  className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"
                  data-testid="text-connect-fullkey-valid"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t("connect.fullKey.valid")}
                </p>
              ) : (
                <p
                  className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"
                  data-testid="text-connect-fullkey-mismatch"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  {t("connect.fullKey.mismatch")}
                </p>
              )
            )}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("connect.connectorsHeading")}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMasked((m) => !m)}
          data-testid="button-connect-mask-toggle"
          className="gap-2"
        >
          {masked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {masked ? t("connect.mask.show") : t("connect.mask.hide")}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4" data-testid="grid-connectors">
        {CONNECTOR_IDS.map((id) => {
          const Icon = CONNECTOR_ICONS[id];
          const snippet = buildSnippet(id, { key: snippetKey });
          const deepLink = CONNECTOR_DEEP_LINKS[id];
          const tool = t(`connect.connectors.${id}.title`);
          return (
            <Card
              key={id}
              className="p-5 flex flex-col gap-3"
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
                  className="rounded-md bg-muted/70 dark:bg-muted/40 border p-3 pr-12 overflow-x-auto text-xs font-mono leading-relaxed max-h-56"
                  data-testid={`code-snippet-${id}`}
                >
                  {snippet}
                </pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => onCopy(id, snippet)}
                  data-testid={`button-copy-snippet-${id}`}
                  aria-label={t("connect.copy")}
                >
                  {copiedConnector === id ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                {copiedConnector === id && (
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
        })}
      </div>

      <Card className="p-5" data-testid="card-test-connection">
        <div className="flex flex-col md:flex-row md:items-start gap-4 md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Plug className="w-4 h-4 text-primary" />
              {t("connect.test.heading")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("connect.test.description", { url: ALLOTLY_MCP_URL })}
            </p>
            {!fullKeyMatches && (
              <p
                className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1.5"
                data-testid="text-connect-test-needs-key"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {t("connect.fullKey.missingForTest")}
              </p>
            )}
          </div>
          <Button
            onClick={onTest}
            disabled={!fullKeyMatches || testing}
            data-testid="button-connect-test"
            className="shrink-0"
          >
            {testing ? t("connect.test.testing") : t("connect.test.button")}
          </Button>
        </div>

        {testResult && (
          <div
            className={`mt-4 rounded-md border p-3 ${
              testResult.state === "green"
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
                : testResult.state === "red"
                  ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200"
                  : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200"
            }`}
            data-testid={`status-test-${testResult.state}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {testResult.state === "green" && <CheckCircle2 className="w-4 h-4" />}
              {testResult.state === "red" && <AlertCircle className="w-4 h-4" />}
              {testResult.state === "yellow" && <Wifi className="w-4 h-4" />}
              <span>
                {testResult.state === "green"
                  ? t("connect.test.green", { count: testResult.toolCount ?? 0 })
                  : testResult.state === "red"
                    ? t("connect.test.red")
                    : t("connect.test.yellow")}
              </span>
            </div>
            {(testResult.raw || testResult.errorMessage) && (
              <Collapsible open={showRaw} onOpenChange={setShowRaw}>
                <CollapsibleTrigger asChild>
                  <button
                    className="mt-2 text-xs underline-offset-2 hover:underline inline-flex items-center gap-1"
                    data-testid="button-connect-show-raw"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${showRaw ? "rotate-180" : ""}`}
                    />
                    {showRaw ? t("connect.test.hideResponse") : t("connect.test.showResponse")}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre
                    className="mt-2 text-[11px] font-mono bg-background/60 dark:bg-background/40 border rounded p-2 overflow-x-auto max-h-48"
                    data-testid="text-connect-raw-response"
                  >
                    {JSON.stringify(testResult.raw ?? { error: testResult.errorMessage }, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </Card>

      <Collapsible>
        <Card className="p-0 overflow-hidden" data-testid="card-examples">
          <CollapsibleTrigger asChild>
            <button
              className="w-full p-5 flex items-center justify-between text-left hover-elevate active-elevate-2"
              data-testid="button-toggle-examples"
            >
              <div>
                <h2 className="text-base font-semibold">{t("connect.examples.heading")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("connect.examples.description")}
                </p>
              </div>
              <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-5 pb-5 space-y-2">
              {([1, 2, 3] as const).map((n) => (
                <div
                  key={n}
                  className="rounded-md bg-muted/50 px-3 py-2 text-sm font-mono"
                  data-testid={`text-example-prompt-${n}`}
                >
                  {t(`connect.examples.prompt${n}`)}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <p className="text-xs text-muted-foreground">
        <Link
          href="/dashboard/keys"
          className="text-primary hover-elevate active-elevate-2 rounded px-1 py-0.5"
          data-testid="link-back-to-keys"
        >
          ← {t("connect.backToKeys")}
        </Link>
      </p>
    </div>
  );
}
