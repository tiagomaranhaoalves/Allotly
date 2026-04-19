import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type {
  ArenaMode,
  KeyType,
  PersonaOrSecretKeeper,
  SessionState,
  VoteRecord,
  ModelId,
  Persona,
  LineupSlots,
  RepairNote,
} from "./types";
import { CATALOG_BY_ID, DEFAULT_ALLOWED, DEFAULT_LINEUP } from "./data/model-catalog";

const LS_KEY_REMEMBERED = "allotly:arena:rememberedKey";
const LS_KEY_SESSION = "allotly:arena:session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const EXHAUSTION_THRESHOLD_USD = 0.02;

export const initialState: SessionState = {
  mode: "cached",
  keyType: null,
  keyValue: null,
  totalBudgetUSD: 20.0,
  allocatedUSD: 0,
  remainingUSD: 0,
  currentMode: null,
  modesPlayed: [],
  roundsPlayed: { marketing: 0, research: 0, creative: 0, "secret-keeper": 0 },
  voteHistory: [],
  sessionStartTime: null,
  isExhausted: false,
  allocationConfirmed: false,
  setupConfirmed: false,
  allowedModels: [...DEFAULT_ALLOWED],
  lineup: [...DEFAULT_LINEUP] as LineupSlots,
  keyExpiresAt: null,
  lastRepairs: [],
};

type Action =
  | { type: "RESET" }
  | { type: "SET_MODE"; mode: ArenaMode }
  | {
      type: "SET_LIVE_KEY";
      keyValue: string;
      keyType: KeyType;
      totalBudgetUSD: number;
      expiresAt: string | null;
    }
  | { type: "CLEAR_LIVE_KEY" }
  | { type: "ALLOCATE"; amountUSD: number }
  | { type: "ENTER_MODE"; mode: PersonaOrSecretKeeper }
  | { type: "SPEND"; amountUSD: number }
  | { type: "SYNC_REMAINING"; amountUSD: number }
  | { type: "RECORD_VOTE"; vote: VoteRecord }
  | { type: "INCREMENT_ROUND"; mode: PersonaOrSecretKeeper }
  | { type: "SET_EXHAUSTED"; exhausted: boolean }
  | { type: "SET_ALLOWLIST"; allowedModels: ModelId[] }
  | { type: "SET_LINEUP"; lineup: LineupSlots }
  | { type: "CLEAR_REPAIRS" }
  | { type: "CONFIRM_SETUP" }
  | { type: "HYDRATE"; state: SessionState };

export type SessionAction = Action;

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "RESET":
      return { ...initialState };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_LIVE_KEY":
      return {
        ...state,
        mode: "live",
        keyValue: action.keyValue,
        keyType: action.keyType,
        totalBudgetUSD: action.totalBudgetUSD,
        remainingUSD: 0,
        allocatedUSD: 0,
        allocationConfirmed: false,
        keyExpiresAt: action.expiresAt,
      };
    case "CLEAR_LIVE_KEY":
      return {
        ...state,
        mode: "cached",
        keyValue: null,
        keyType: null,
        keyExpiresAt: null,
      };
    case "ALLOCATE":
      return {
        ...state,
        allocatedUSD: action.amountUSD,
        remainingUSD: action.amountUSD,
        allocationConfirmed: true,
        sessionStartTime: state.sessionStartTime ?? Date.now(),
      };
    case "ENTER_MODE": {
      const played = state.modesPlayed.includes(action.mode)
        ? state.modesPlayed
        : [...state.modesPlayed, action.mode];
      return { ...state, currentMode: action.mode, modesPlayed: played };
    }
    case "SPEND": {
      const next = Math.max(0, state.remainingUSD - action.amountUSD);
      return {
        ...state,
        remainingUSD: next,
        isExhausted: next <= EXHAUSTION_THRESHOLD_USD,
      };
    }
    case "SYNC_REMAINING": {
      const next = Math.max(0, action.amountUSD);
      return {
        ...state,
        remainingUSD: next,
        isExhausted: next <= EXHAUSTION_THRESHOLD_USD,
      };
    }
    case "RECORD_VOTE":
      return { ...state, voteHistory: [...state.voteHistory, action.vote] };
    case "INCREMENT_ROUND":
      return {
        ...state,
        roundsPlayed: {
          ...state.roundsPlayed,
          [action.mode]: (state.roundsPlayed[action.mode] ?? 0) + 1,
        },
      };
    case "SET_EXHAUSTED":
      return { ...state, isExhausted: action.exhausted };
    case "SET_ALLOWLIST": {
      const allowed = action.allowedModels;
      // Repair lineup so every slot is still in the new allowlist;
      // snap any orphaned slot to the cheapest remaining allowed model.
      // Prefer the cheapest catalog model as a repair target. Custom (live-only)
      // ids are only used if no catalog model remains on the allowlist.
      const catalogAllowed = allowed.filter((id) => CATALOG_BY_ID[id]);
      const repairPool = catalogAllowed.length > 0 ? catalogAllowed : allowed;
      const cheapest =
        [...repairPool].sort(
          (a, b) => (CATALOG_BY_ID[a]?.inputPerM ?? 0) - (CATALOG_BY_ID[b]?.inputPerM ?? 0),
        )[0] ?? state.lineup[0];
      const repairs: RepairNote[] = [];
      const now = Date.now();
      const lineup = state.lineup.map((m, i) => {
        if (allowed.includes(m)) return m;
        repairs.push({ slotIndex: i as 0 | 1 | 2, from: m, to: cheapest, at: now });
        return cheapest;
      }) as LineupSlots;
      return {
        ...state,
        allowedModels: allowed,
        lineup,
        lastRepairs: repairs,
      };
    }
    case "SET_LINEUP":
      // User edits to the lineup clear any pending auto-repair notes for that slot.
      return { ...state, lineup: action.lineup, lastRepairs: [] };
    case "CLEAR_REPAIRS":
      return { ...state, lastRepairs: [] };
    case "CONFIRM_SETUP":
      return { ...state, setupConfirmed: true };
    case "HYDRATE":
      return action.state;
    default:
      return state;
  }
}

interface SessionContextValue {
  state: SessionState;
  reset: () => void;
  setMode: (mode: ArenaMode) => void;
  setLiveKey: (args: {
    keyValue: string;
    keyType: KeyType;
    totalBudgetUSD: number;
    expiresAt: string | null;
    remember: boolean;
  }) => void;
  clearLiveKey: () => void;
  allocate: (amountUSD: number) => void;
  enterMode: (mode: PersonaOrSecretKeeper) => void;
  spend: (amountUSD: number) => void;
  syncRemaining: (amountUSD: number) => void;
  recordVote: (vote: VoteRecord) => void;
  incrementRound: (mode: PersonaOrSecretKeeper) => void;
  setAllowlist: (allowedModels: ModelId[]) => void;
  setLineup: (lineup: LineupSlots) => void;
  clearRepairs: () => void;
  confirmSetup: () => void;
  favouriteModel: () => ModelId | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function serialize(state: SessionState) {
  return state;
}

export function deserialize(raw: unknown): SessionState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sessionStartTime === "number" && Date.now() - r.sessionStartTime > SESSION_TTL_MS) {
    return null;
  }
  const modesPlayed = Array.isArray(r.modesPlayed) ? (r.modesPlayed as PersonaOrSecretKeeper[]) : [];
  // Backfill new fields on hydration so older saved sessions don't crash.
  const allowedModels = Array.isArray(r.allowedModels) && r.allowedModels.length > 0
    ? (r.allowedModels as ModelId[])
    : [...DEFAULT_ALLOWED];
  const lineup =
    Array.isArray(r.lineup) && r.lineup.length === 3
      ? (r.lineup as LineupSlots)
      : ([...DEFAULT_LINEUP] as LineupSlots);
  const setupConfirmed = typeof r.setupConfirmed === "boolean" ? r.setupConfirmed : false;
  return {
    ...(r as unknown as SessionState),
    modesPlayed,
    allowedModels,
    lineup,
    setupConfirmed,
    lastRepairs: [],
  };
}

export function ArenaSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LS_KEY_SESSION);
      if (raw) {
        const parsed = deserialize(JSON.parse(raw));
        if (parsed) dispatch({ type: "HYDRATE", state: parsed });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(LS_KEY_SESSION, JSON.stringify(serialize(state)));
    } catch {
      /* ignore */
    }
  }, [state]);

  const value = useMemo<SessionContextValue>(() => {
    return {
      state,
      reset: () => {
        sessionStorage.removeItem(LS_KEY_SESSION);
        dispatch({ type: "RESET" });
      },
      setMode: (mode) => dispatch({ type: "SET_MODE", mode }),
      setLiveKey: ({ keyValue, keyType, totalBudgetUSD, expiresAt, remember }) => {
        if (remember) {
          try {
            localStorage.setItem(LS_KEY_REMEMBERED, keyValue);
          } catch {
            /* ignore */
          }
        }
        dispatch({ type: "SET_LIVE_KEY", keyValue, keyType, totalBudgetUSD, expiresAt });
      },
      clearLiveKey: () => {
        try {
          localStorage.removeItem(LS_KEY_REMEMBERED);
        } catch {
          /* ignore */
        }
        dispatch({ type: "CLEAR_LIVE_KEY" });
      },
      allocate: (amountUSD) => dispatch({ type: "ALLOCATE", amountUSD }),
      enterMode: (mode) => dispatch({ type: "ENTER_MODE", mode }),
      spend: (amountUSD) => dispatch({ type: "SPEND", amountUSD }),
      syncRemaining: (amountUSD) => dispatch({ type: "SYNC_REMAINING", amountUSD }),
      recordVote: (vote) => dispatch({ type: "RECORD_VOTE", vote }),
      incrementRound: (mode) => dispatch({ type: "INCREMENT_ROUND", mode }),
      setAllowlist: (allowedModels) => dispatch({ type: "SET_ALLOWLIST", allowedModels }),
      setLineup: (lineup) => dispatch({ type: "SET_LINEUP", lineup }),
      clearRepairs: () => dispatch({ type: "CLEAR_REPAIRS" }),
      confirmSetup: () => dispatch({ type: "CONFIRM_SETUP" }),
      favouriteModel: () => {
        if (state.voteHistory.length === 0) return null;
        const counts: Partial<Record<ModelId, number>> = {};
        for (const v of state.voteHistory) {
          counts[v.bestPick] = (counts[v.bestPick] ?? 0) + 1;
        }
        let best: ModelId | null = null;
        let max = 0;
        for (const [model, count] of Object.entries(counts) as [ModelId, number][]) {
          if (count > max) {
            max = count;
            best = model;
          }
        }
        return best;
      },
    };
  }, [state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useArenaSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useArenaSession must be used within ArenaSessionProvider");
  return ctx;
}

export function getRememberedKey(): string | null {
  try {
    return localStorage.getItem(LS_KEY_REMEMBERED);
  } catch {
    return null;
  }
}

export function clearRememberedKey() {
  try {
    localStorage.removeItem(LS_KEY_REMEMBERED);
  } catch {
    /* ignore */
  }
}

export function formatUSD(usd: number, decimals: number = 2): string {
  return usd.toFixed(decimals);
}

export function voteIsPersona(mode: PersonaOrSecretKeeper): mode is Persona {
  return mode === "marketing" || mode === "research" || mode === "creative";
}

export function hasPlayed(state: SessionState, mode: PersonaOrSecretKeeper): boolean {
  return state.modesPlayed.includes(mode);
}
