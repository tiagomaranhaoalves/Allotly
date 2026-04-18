import cachedV1 from "./content/cached-v1.json";
import type { ArenaContent, Challenge, Persona, SecretKeeperBattle, SecretKeeperDifficulty } from "./types";

export const arenaContent = cachedV1 as unknown as ArenaContent;

export function getChallengesByPersona(persona: Persona): Challenge[] {
  return Object.values(arenaContent.challenges).filter((c) => c.persona === persona);
}

export function pickChallenge(persona: Persona, exclude: Set<string> = new Set()): Challenge | null {
  const pool = getChallengesByPersona(persona).filter((c) => !exclude.has(c.id));
  if (pool.length === 0) {
    const all = getChallengesByPersona(persona);
    if (all.length === 0) return null;
    return all[Math.floor(Math.random() * all.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickBattle(difficulty: SecretKeeperDifficulty): SecretKeeperBattle | null {
  const pool = arenaContent.secretKeeper.cachedBattles.filter((b) => b.difficulty === difficulty);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function recommendedSpendUSD(persona: Persona | "secret-keeper"): number {
  switch (persona) {
    case "marketing":
      return 0.3;
    case "research":
      return 0.4;
    case "creative":
      return 0.25;
    case "secret-keeper":
      return 0.6;
  }
}
