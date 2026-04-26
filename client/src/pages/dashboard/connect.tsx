import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { PlugZap, Key as KeyIcon } from "lucide-react";
import { ConnectorGrid } from "@/components/connectors";

interface MyKey {
  id: string;
  keyPrefix: string;
  status: "ACTIVE" | "REVOKED" | string;
  lastUsedAt: string | null;
  createdAt: string;
}

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

  useEffect(() => {
    if (selectedKeyId === null && activeKeys.length > 0) {
      setSelectedKeyId(pickDefaultKeyId(activeKeys, queryKeyId));
    }
  }, [activeKeys, queryKeyId, selectedKeyId]);

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

      <ConnectorGrid
        mode="full"
        keyContext={{
          kind: "selectable",
          keys: activeKeys.map((k) => ({ id: k.id, keyPrefix: k.keyPrefix })),
          selectedId: selectedKeyId,
          onSelectKey: setSelectedKeyId,
        }}
      />

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
