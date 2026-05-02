import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import {
  CONNECTOR_IDS,
  cleanPrefix,
  isValidFullKey,
  maskKey,
} from "@/pages/dashboard/connect-helpers";
import { OAUTH_CONNECTORS } from "@shared/connector-snippets";
import { ConnectorCard } from "./connector-card";
import { ConnectorTestPanel } from "./connector-test-panel";
import { OAuthConnectorCard } from "./oauth-connector-card";

export interface SelectableKey {
  id: string;
  keyPrefix: string;
}

export type KeyContext =
  | {
      kind: "selectable";
      keys: SelectableKey[];
      selectedId: string | null;
      onSelectKey: (id: string) => void;
    }
  | {
      kind: "fixed";
      /** Full plaintext key (e.g. just-minted from /api/vouchers/redeem). */
      value: string;
      /** Prefix used for the masked rendering. */
      prefix: string;
    };

/**
 * Which subset of the 8 connectors to render.
 *  - "stdio-only" (default): the 5 CLI / IDE bridges (Cursor, VS Code,
 *    Claude Code, Codex, Claude Desktop). Uses ConnectorCard with the
 *    paste-the-key flow + the Test Connection panel.
 *  - "oauth-only": the 3 hosted-AI OAuth cards (Claude.ai, ChatGPT,
 *    Gemini). Uses OAuthConnectorCard. No key context, mask toggle,
 *    Test Connection, or examples are rendered (OAuth doesn't use a
 *    pasted bearer).
 *  - "all": both subsets, OAuth section first.
 */
export type ConnectorGridVariant = "stdio-only" | "oauth-only" | "all";

export interface ConnectorGridProps {
  mode: "full" | "compact";
  /** Subset of connectors to render. Default: "stdio-only" (legacy behavior). */
  variant?: ConnectorGridVariant;
  /** Required when the rendered variant includes stdio cards. Ignored for "oauth-only". */
  keyContext?: KeyContext;
  /** Default mask state. Defaults to true in "full" mode, false in "compact" mode. */
  defaultMasked?: boolean;
  /** Whether to render the Test Connection panel below the grid. Default: true. */
  showTestConnection?: boolean;
  /** Whether to render the example prompts collapsible. Default: true in "full", false in "compact". */
  showExamples?: boolean;
  /**
   * Optional callback fired when the testable full plaintext key changes
   * (becomes valid → string, becomes invalid → null). Used by the
   * /dashboard/connect page to surface a "Test your key" button ABOVE the
   * grid that shares the same pasted-key state.
   */
  onTestKeyChange?: (testKey: string | null) => void;
}

const SNIPPET_PLACEHOLDER_TOKEN = "<paste-your-allotly-key>";

export function ConnectorGrid({
  mode,
  variant = "stdio-only",
  keyContext,
  defaultMasked,
  showTestConnection = true,
  showExamples,
  onTestKeyChange,
}: ConnectorGridProps) {
  const { t } = useTranslation();
  const renderOAuth = variant === "oauth-only" || variant === "all";
  const renderStdio = variant === "stdio-only" || variant === "all";

  if (renderStdio && !keyContext) {
    throw new Error(
      'ConnectorGrid: keyContext is required when variant includes stdio cards. Pass keyContext or use variant="oauth-only".',
    );
  }

  // Default mask state. Both modes default to UNMASKED (matches the prior
  // /dashboard/connect behavior where the placeholder/prefix is shown until
  // the user actively pastes their full key, and matches D3 for the
  // post-redeem compact view). The mask toggle is always present.
  const initialMasked = defaultMasked ?? false;
  const [masked, setMasked] = useState(initialMasked);
  const [fullKeyInput, setFullKeyInput] = useState("");

  // Resolve the prefix and full key based on the context kind.
  // For "oauth-only" variant keyContext may be undefined; the values below
  // are unused in that case (the stdio-card branch is gated by renderStdio).
  const selectedPrefix = useMemo(() => {
    if (!keyContext) return "";
    if (keyContext.kind === "selectable") {
      const k = keyContext.keys.find((k) => k.id === keyContext.selectedId);
      return k?.keyPrefix ?? "";
    }
    return keyContext.prefix;
  }, [keyContext]);

  const fullKey = keyContext?.kind === "fixed" ? keyContext.value : fullKeyInput;

  const fullKeyMatches =
    keyContext?.kind === "fixed"
      ? true // we trust the fixed key
      : fullKeyInput.length > 0 && selectedPrefix.length > 0
        ? isValidFullKey(fullKeyInput, selectedPrefix)
        : false;

  // The string actually injected into snippets.
  const snippetKey = useMemo(() => {
    if (fullKeyMatches && fullKey) {
      return masked ? maskKey(fullKey) : fullKey;
    }
    if (selectedPrefix && masked) {
      return `${cleanPrefix(selectedPrefix)}•••••`;
    }
    return SNIPPET_PLACEHOLDER_TOKEN;
  }, [fullKeyMatches, masked, fullKey, selectedPrefix]);

  // For Test Connection — only the actual full plaintext key is testable.
  const testKey = fullKeyMatches && fullKey ? fullKey : null;

  // Notify the parent (e.g. /dashboard/connect) so it can render its own
  // "Test your key" button above the grid that shares this state.
  useEffect(() => {
    onTestKeyChange?.(testKey);
  }, [testKey, onTestKeyChange]);

  const showExamplesResolved = showExamples ?? (mode === "full");

  // OAuth cards are rendered identically in "oauth-only" and "all" — kept
  // in one place so adding a card / changing the grid layout only touches
  // a single spot. The OAuth flow doesn't need a pasted bearer, so the
  // entire stdio chrome (key selector / mask toggle / Test Connection /
  // examples) is skipped for "oauth-only".
  const oauthGrid = renderOAuth ? (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="grid-oauth-connectors"
    >
      {OAUTH_CONNECTORS.map((spec) => (
        <OAuthConnectorCard key={spec.id} spec={spec} />
      ))}
    </div>
  ) : null;

  if (variant === "oauth-only") {
    return oauthGrid;
  }

  return (
    <div className="space-y-6">
      {oauthGrid}

      {keyContext?.kind === "selectable" && (
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
                value={keyContext.selectedId ?? undefined}
                onValueChange={(v) => {
                  keyContext.onSelectKey(v);
                  setFullKeyInput("");
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
                  {keyContext.keys.map((k) => (
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
                onChange={(e) => setFullKeyInput(e.target.value.trim())}
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
      )}

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

      <div
        className={
          mode === "full"
            ? "grid md:grid-cols-2 gap-4"
            : "grid grid-cols-1 gap-4"
        }
        data-testid="grid-connectors"
        data-mode={mode}
      >
        {CONNECTOR_IDS.map((id) => (
          <ConnectorCard
            key={id}
            id={id}
            snippetKey={snippetKey}
            compact={mode === "compact"}
          />
        ))}
      </div>

      {showTestConnection && (
        <ConnectorTestPanel
          testKey={testKey}
          missingKeyMessage={
            keyContext?.kind === "selectable" ? t("connect.fullKey.missingForTest") : undefined
          }
        />
      )}

      {showExamplesResolved && (
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
      )}
    </div>
  );
}
