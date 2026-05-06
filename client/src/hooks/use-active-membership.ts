import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";

export interface MyMembership {
  id: string;
  teamId: string;
  teamName: string;
  accessType: "TEAM" | "VOUCHER" | string;
  status: "ACTIVE" | "SUSPENDED" | "BUDGET_EXHAUSTED" | "EXPIRED" | string;
  monthlyBudgetCents: number;
  currentPeriodSpendCents: number;
  periodEnd: string | null;
  voucherExpiresAt: string | null;
}

const STORAGE_KEY = "allotly:active_membership_id";
const PARAM = "membership";

function readSearchParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PARAM);
}

function readInitial(): string | null {
  const fromParam = readSearchParam();
  if (fromParam) return fromParam;
  if (typeof window !== "undefined") {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

// Module-level store shared by every consumer of `useActiveMembership` so
// switching the active membership in one component immediately re-renders
// every other component reading the same state.
let currentSelectedId: string | null = readInitial();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentSelectedId;
}

function getServerSnapshot() {
  return null;
}

function notify() {
  listeners.forEach((l) => l());
}

function setSelectedIdGlobal(id: string | null) {
  if (currentSelectedId === id) return;
  currentSelectedId = id;
  notify();
}

if (typeof window !== "undefined") {
  // Keep the shared store in sync with browser back/forward.
  window.addEventListener("popstate", () => {
    const fromParam = readSearchParam();
    if (fromParam !== null && fromParam !== currentSelectedId) {
      setSelectedIdGlobal(fromParam);
    }
  });
}

export function useActiveMembership() {
  const { data: memberships, isLoading } = useQuery<MyMembership[]>({
    queryKey: ["/api/me/memberships"],
    staleTime: 30_000,
  });

  const selectedId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // If the persisted id no longer maps to a real membership (revoked,
  // transferred, etc), drop it and fall back to whatever the server picks
  // implicitly (highest-priority active row).
  const validatedSelectedId = useMemo(() => {
    if (!selectedId || !memberships) return selectedId;
    return memberships.some((m) => m.id === selectedId) ? selectedId : null;
  }, [selectedId, memberships]);

  // Clear the stale id from the shared store too, so other consumers don't
  // keep building stale `?membershipId=` URLs.
  useEffect(() => {
    if (selectedId && memberships && validatedSelectedId === null) {
      setSelectedIdGlobal(null);
    }
  }, [selectedId, memberships, validatedSelectedId]);

  const active = useMemo(() => {
    if (!memberships || memberships.length === 0) return null;
    if (validatedSelectedId) {
      const found = memberships.find((m) => m.id === validatedSelectedId);
      if (found) return found;
    }
    return memberships[0];
  }, [memberships, validatedSelectedId]);

  function setSelectedId(id: string) {
    setSelectedIdGlobal(id);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Quota / private-mode — non-fatal.
    }
    // Reflect the selection in the URL so deep links / page reloads keep
    // the user on the same membership without hitting the brief flash of
    // "primary" data first.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(PARAM, id);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Ignore URL update failures (cross-origin / unsupported envs).
    }
  }

  return {
    memberships: memberships || [],
    isLoading,
    activeMembershipId: active?.id ?? validatedSelectedId ?? null,
    activeMembership: active,
    setActiveMembershipId: setSelectedId,
    hasMultiple: (memberships?.length ?? 0) > 1,
  };
}
