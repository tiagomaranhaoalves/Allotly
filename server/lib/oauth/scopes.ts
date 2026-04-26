export const SUPPORTED_SCOPES = ["mcp", "mcp:read"] as const;
export type Scope = typeof SUPPORTED_SCOPES[number];

export const DEFAULT_SCOPE = "mcp";
export const MCP_AUDIENCE = "https://allotly.ai/mcp";

export function parseScopeString(scope: string | undefined | null): string[] {
  if (!scope) return [];
  return scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidScopeSubset(requested: string[], allowed: string[]): boolean {
  if (requested.length === 0) return false;
  for (const s of requested) {
    if (!allowed.includes(s)) return false;
  }
  return true;
}

export function scopeIncludes(grantedScopes: string[], requiredScope: string): boolean {
  if (requiredScope === "mcp:read") {
    return grantedScopes.includes("mcp") || grantedScopes.includes("mcp:read");
  }
  if (requiredScope === "mcp") {
    return grantedScopes.includes("mcp");
  }
  return grantedScopes.includes(requiredScope);
}

export function normaliseScopes(input: string | string[] | undefined | null): string[] {
  if (!input) return [DEFAULT_SCOPE];
  const arr = Array.isArray(input) ? input : parseScopeString(input);
  const filtered = arr.filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s));
  return filtered.length === 0 ? [DEFAULT_SCOPE] : filtered;
}
