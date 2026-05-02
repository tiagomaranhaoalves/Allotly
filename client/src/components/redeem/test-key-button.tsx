import { useEffect, useRef, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Wifi } from "lucide-react";

type UserType = "team_admin" | "team_member" | "voucher_recipient";
type TestErrorCode =
  | "no_providers_active"
  | "no_models_in_tier"
  | "budget_exhausted"
  | "rate_limited"
  | "provider_error"
  | "unknown";

interface BudgetDisplay {
  currency: string;
  formatted: { remaining: string; total: string; spent: string };
  minor_units: { remaining: number; total: number; spent: number };
}

interface SuccessResponse {
  success: true;
  user_type: UserType;
  model_used: string;
  response_text: string;
  cost_usd_cents: number;
  /** FX-converted cost in the org's display currency (server-built). */
  cost: {
    usd_cents: number;
    display: BudgetDisplay;
  };
  budget: {
    remaining_usd_cents: number;
    total_usd_cents: number;
    display: BudgetDisplay;
  };
  latency_ms: number;
}

interface FailureResponse {
  success: false;
  user_type: UserType;
  error: { code: TestErrorCode; message: string; hint: string };
  budget?: {
    remaining_usd_cents: number;
    total_usd_cents: number;
    display: BudgetDisplay;
  };
}

type TestResponse = SuccessResponse | FailureResponse;

export interface TestKeyButtonProps {
  /**
   * Full plaintext key. When provided, the button calls
   * `POST /api/v1/test-connection` with `Authorization: Bearer <key>`.
   * For OAuth-only users with no pasteable key, leave this null and pass
   * `membershipId` instead — the button will fall back to the session-cookie
   * variant `POST /api/v1/test-connection/session`.
   */
  testKey: string | null;
  /**
   * Membership the test should run against when `testKey` is null. Enables
   * the "Test connection" button for OAuth-connected users who reach Allotly
   * via Claude.ai / ChatGPT / Gemini and never paste a bearer token. The
   * server validates that this membership belongs to the logged-in caller.
   * If omitted but `useSession` is true, the server falls back to the
   * caller's single membership.
   */
  membershipId?: string | null;
  /**
   * When true and `testKey` is null, fall back to the session-cookie variant
   * (`POST /api/v1/test-connection/session`) instead of disabling the
   * button. Pass alongside an optional `membershipId`.
   */
  useSession?: boolean;
  /** Heading rendered above the button. */
  heading: string;
  /** Optional subtitle describing what the test does. */
  subtitle?: string;
  /** Optional banner shown when neither testKey nor membershipId are set. */
  missingKeyMessage?: string;
  /**
   * When true, automatically run the test once as soon as a non-empty
   * `testKey` becomes available. Used by the post-redeem flow on /redeem
   * to prove the key works end-to-end without requiring a manual click.
   * The "Try again" buttons remain available for manual retries.
   */
  autoRun?: boolean;
}

const BRANCHED_CODES: TestErrorCode[] = ["no_providers_active", "no_models_in_tier", "budget_exhausted"];

/**
 * The cost row reads from the server-provided `cost.display` block (built
 * with the same `buildDisplayBlock` helper as the budget block) so FX
 * conversion + locale formatting are consistent across the envelope.
 * `formatted.total` carries the cost in the org's display currency.
 */
function formatCost(cost: SuccessResponse["cost"]): string {
  return cost.display.formatted.total;
}

export function TestKeyButton({
  testKey,
  membershipId,
  useSession,
  heading,
  subtitle,
  missingKeyMessage,
  autoRun = false,
}: TestKeyButtonProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<TestResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // A pasted bearer key takes precedence; the session-cookie variant only
  // kicks in for OAuth-only users (no pasteable key) when the caller opts
  // in via `useSession` or supplies an explicit `membershipId`.
  const hasKey = !!testKey && testKey.length > 0;
  const usingSession = !hasKey && (useSession === true || !!membershipId);
  const canTest = hasKey || usingSession;
  const autoRanRef = useRef(false);

  async function runTest() {
    if (!canTest) return;
    setTesting(true);
    setResult(null);
    setNetworkError(null);
    try {
      const res = usingSession
        ? await fetch("/api/v1/test-connection/session", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(membershipId ? { membershipId } : {}),
          })
        : await fetch("/api/v1/test-connection", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${testKey}`,
              "Content-Type": "application/json",
            },
            body: "{}",
          });
      let body: TestResponse | null = null;
      try {
        body = (await res.json()) as TestResponse;
      } catch {
        body = null;
      }
      if (!body) {
        setNetworkError(t("testKey.network.invalidResponse"));
      } else {
        setResult(body);
      }
    } catch (e: any) {
      setNetworkError(e?.message || t("testKey.network.unreachable"));
    } finally {
      setTesting(false);
    }
  }

  // Auto-fire once when the key first becomes available (post-redeem flow).
  // Guarded by a ref so we don't re-run on re-renders or after the user
  // clicks "Try again". /dashboard/connect leaves autoRun=false (default).
  useEffect(() => {
    if (!autoRun) return;
    if (autoRanRef.current) return;
    if (!canTest) return;
    autoRanRef.current = true;
    runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, canTest, testKey]);

  return (
    <Card className="p-5 space-y-4" data-testid="card-test-key">
      <div className="flex items-center gap-2">
        <Wifi className="w-5 h-5 text-primary shrink-0" />
        <h3 className="font-semibold" data-testid="text-test-key-heading">{heading}</h3>
      </div>

      {subtitle && (
        <p className="text-sm text-muted-foreground" data-testid="text-test-key-subtitle">{subtitle}</p>
      )}

      {!canTest && missingKeyMessage && (
        <p className="text-sm text-amber-700 dark:text-amber-400" data-testid="text-test-key-missing">
          {missingKeyMessage}
        </p>
      )}

      <div>
        <Button
          onClick={runTest}
          disabled={!canTest || testing}
          data-testid="button-test-key"
          className="gap-2"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("testKey.testing")}
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4" />
              {t("testKey.button")}
            </>
          )}
        </Button>
      </div>

      {networkError && !testing && (
        <div
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 space-y-2"
          data-testid="card-test-key-network-error"
        >
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {t("testKey.network.title")}
              </p>
              <p className="text-sm text-red-700 dark:text-red-400" data-testid="text-test-key-network-message">
                {networkError}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runTest}
            data-testid="button-test-key-retry-network"
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("testKey.retry")}
          </Button>
        </div>
      )}

      {result && result.success && (
        <div
          className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3"
          data-testid="card-test-key-success"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                {t("testKey.success.title")}
              </p>
              {result.response_text && (
                <p
                  className="text-sm text-emerald-700 dark:text-emerald-400 font-mono"
                  data-testid="text-test-key-response"
                >
                  {result.response_text}
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {t("testKey.success.modelLabel")}
              </dt>
              <dd
                className="font-mono text-emerald-900 dark:text-emerald-200"
                data-testid="text-test-key-model"
              >
                {result.model_used}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {t("testKey.success.costLabel")}
              </dt>
              <dd
                className="font-mono text-emerald-900 dark:text-emerald-200"
                data-testid="text-test-key-cost"
              >
                {formatCost(result.cost)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {t("testKey.success.budgetLabel")}
              </dt>
              <dd
                className="font-mono text-emerald-900 dark:text-emerald-200"
                data-testid="text-test-key-budget"
              >
                {result.budget.display.formatted.remaining}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {t("testKey.success.latencyLabel")}
              </dt>
              <dd
                className="font-mono text-emerald-900 dark:text-emerald-200"
                data-testid="text-test-key-latency"
              >
                {t("testKey.success.latencyValue", { ms: result.latency_ms })}
              </dd>
            </div>
          </dl>

          <Button
            variant="outline"
            size="sm"
            onClick={runTest}
            data-testid="button-test-key-retry-success"
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("testKey.retry")}
          </Button>
        </div>
      )}

      {result && !result.success && (
        <div
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 space-y-3"
          data-testid="card-test-key-error"
          data-error-code={result.error.code}
          data-user-type={result.user_type}
        >
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p
                className="text-sm font-semibold text-red-800 dark:text-red-300"
                data-testid="text-test-key-error-title"
              >
                {t(`testKey.error.titles.${result.error.code}`, t("testKey.error.titles.unknown"))}
              </p>
              <p
                className="text-sm text-red-700 dark:text-red-400"
                data-testid="text-test-key-error-hint"
              >
                <ErrorHint code={result.error.code} userType={result.user_type} fallback={result.error.hint} />
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runTest}
            data-testid="button-test-key-retry-error"
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("testKey.retry")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ErrorHint({
  code,
  userType,
  fallback,
}: {
  code: TestErrorCode;
  userType: UserType;
  fallback: string;
}) {
  const { t } = useTranslation();
  const isBranched = BRANCHED_CODES.includes(code);
  const key = isBranched ? `testKey.hints.${code}.${userType}` : `testKey.hints.${code}`;
  // Render with <Trans> so inline <code> for paths/tool names render verbatim.
  return (
    <Trans
      i18nKey={key}
      defaults={fallback}
      components={{
        code: <code className="px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/40 font-mono text-xs" />,
      }}
    />
  );
}
