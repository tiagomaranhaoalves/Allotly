export type ArenaMode = "cached" | "live";
export type KeyType = "VOUCHER" | "TEAM" | null;
export type Persona = "marketing" | "research" | "creative";
export type PersonaOrSecretKeeper = Persona | "secret-keeper";
export type MockUI = "gmail" | "linkedin" | "notion" | "twitter" | "doc" | "terminal";

export type ModelId =
  | "gpt-4o-mini"
  | "gpt-4o"
  | "o4-mini"
  | "claude-sonnet-4-20250514"
  | "claude-haiku-4-5"
  | "claude-opus-4-7"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro";

export type Provider = "OPENAI" | "ANTHROPIC" | "GOOGLE";

export interface ModelMeta {
  id: ModelId;
  provider: Provider;
  displayName: string;
}

export const DEFAULT_MODELS: ModelMeta[] = [
  { id: "gpt-4o-mini", provider: "OPENAI", displayName: "GPT-4o mini" },
  { id: "claude-sonnet-4-20250514", provider: "ANTHROPIC", displayName: "Claude Sonnet 4" },
  { id: "gemini-2.5-flash", provider: "GOOGLE", displayName: "Gemini 2.5 Flash" },
];

export type LineupSlots = [ModelId, ModelId, ModelId];

export interface CachedChunk {
  delta: string;
  delayMs: number;
}

export interface CachedVariant {
  variantId: string;
  chunks: CachedChunk[];
  totalTokens: number;
  costUSD: number;
  durationMs: number;
}

export interface Challenge {
  id: string;
  persona: Persona;
  title: string;
  mockUI: MockUI;
  contextCopy: string;
  prompt: string;
  systemPrompt?: string;
  recommendedModels: ModelId[];
  teachingNote: string;
  cachedResponses: Record<string, CachedVariant[]>;
}

export type SecretKeeperDifficulty = "easy" | "medium" | "hard";

export interface SecretKeeperBattleExchange {
  role: "attacker" | "defender";
  model: ModelId;
  chunks: CachedChunk[];
  costUSD: number;
}

export interface SecretKeeperBattle {
  battleId: string;
  difficulty: SecretKeeperDifficulty;
  password: string;
  rule?: string;
  attackerModel: ModelId;
  defenderModel: ModelId;
  exchanges: SecretKeeperBattleExchange[];
  outcome: "defender_wins" | "attacker_wins";
  leakedAtRound: number | null;
}

export interface ArenaContent {
  challenges: Record<string, Challenge>;
  secretKeeper: {
    passwords: {
      easy: string[];
      medium: string[];
      hard: { password: string; rule: string }[];
    };
    cachedBattles: SecretKeeperBattle[];
  };
}

export interface VoteRecord {
  mode: Persona;
  challengeId: string;
  bestPick: ModelId;
  wouldPayMostPick: ModelId;
  winnerCost: number;
  costs: Record<string, number>;
}

export interface SessionState {
  mode: ArenaMode;
  keyType: KeyType;
  keyValue: string | null;
  totalBudgetUSD: number;
  allocatedUSD: number;
  remainingUSD: number;
  currentMode: PersonaOrSecretKeeper | null;
  modesPlayed: PersonaOrSecretKeeper[];
  roundsPlayed: Record<PersonaOrSecretKeeper, number>;
  voteHistory: VoteRecord[];
  sessionStartTime: number | null;
  isExhausted: boolean;
  allocationConfirmed: boolean;
  setupConfirmed: boolean;
  allowedModels: ModelId[];
  lineup: LineupSlots;
  keyExpiresAt: string | null;
}

export interface RoundResult {
  perModel: Array<{
    model: ModelMeta;
    text: string;
    costUSD: number;
    tokens: number;
    durationMs: number;
  }>;
}
