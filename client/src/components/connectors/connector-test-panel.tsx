import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plug,
  AlertCircle,
  CheckCircle2,
  Wifi,
  ChevronDown,
} from "lucide-react";
import {
  ALLOTLY_MCP_URL,
  TestResult,
  runTestConnection,
} from "@/pages/dashboard/connect-helpers";

export interface ConnectorTestPanelProps {
  /** The full plaintext key to test against. If empty/undefined, the button is disabled. */
  testKey: string | null;
  /** Optional banner shown when testKey is empty (e.g. "Paste your full key to enable Test connection"). */
  missingKeyMessage?: string;
}

export function ConnectorTestPanel({
  testKey,
  missingKeyMessage,
}: ConnectorTestPanelProps) {
  const { t } = useTranslation();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Clear stale test status whenever the testable key changes (e.g. user
  // selects a different key or edits the pasted full key). Mirrors the
  // pre-refactor behavior on /dashboard/connect.
  useEffect(() => {
    setTestResult(null);
    setShowRaw(false);
  }, [testKey]);

  const canTest = !!testKey && testKey.length > 0;

  const onTest = async () => {
    if (!canTest || !testKey) return;
    setTesting(true);
    setTestResult(null);
    setShowRaw(false);
    const result = await runTestConnection(testKey);
    setTestResult(result);
    setTesting(false);
  };

  return (
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
          {!canTest && missingKeyMessage && (
            <p
              className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1.5"
              data-testid="text-connect-test-needs-key"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {missingKeyMessage}
            </p>
          )}
        </div>
        <Button
          onClick={onTest}
          disabled={!canTest || testing}
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
  );
}
