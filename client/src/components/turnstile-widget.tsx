import { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile script failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  className?: string;
  theme?: "light" | "dark" | "auto";
}

export function isTurnstileConfigured(): boolean {
  return Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
}

export function TurnstileWidget({ onVerify, className, theme = "auto" }: TurnstileWidgetProps) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile || !container) return;
        try {
          widgetIdRef.current = window.turnstile.render(container, {
            sitekey: siteKey,
            theme,
            callback: (token: string) => {
              setError(null);
              onVerify(token);
            },
            "error-callback": () => {
              setError("Captcha failed. Please try again.");
              onVerify(null);
            },
            "expired-callback": () => {
              onVerify(null);
            },
          });
        } catch (e) {
          setError("Could not load captcha.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load captcha.");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, onVerify]);

  if (!siteKey) return null;

  return (
    <div className={className} data-testid="turnstile-widget">
      <div ref={containerRef} />
      {error && (
        <p className="text-xs text-red-500 mt-1" data-testid="text-turnstile-error">
          {error}
        </p>
      )}
    </div>
  );
}
