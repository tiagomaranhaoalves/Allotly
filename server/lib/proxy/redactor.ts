const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi,
  /api-key:\s*[A-Za-z0-9\-_.~+/]+/gi,
  /sk-ant-[A-Za-z0-9_\-]{16,}/g,
  /sk-[A-Za-z0-9_\-]{16,}/g,
  /allotly_sk_[A-Za-z0-9_\-]+/g,
  /[?&](api-key|key)=[^&\s"'}]+/gi,
];

const SECRET_REPLACEMENTS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, "Bearer ***"],
  [/api-key:\s*[A-Za-z0-9\-_.~+/]+/gi, "api-key: ***"],
  [/sk-ant-[A-Za-z0-9_\-]{16,}/g, "***"],
  [/sk-[A-Za-z0-9_\-]{16,}/g, "***"],
  [/allotly_sk_[A-Za-z0-9_\-]+/g, "***"],
  [/([?&](?:api-key|key))=[^&\s"'}]+/gi, "$1=***"],
];

export function redact(text: string, providerKeys: string[] = []): string {
  let result = text;

  for (const key of providerKeys) {
    if (key && key.length > 8) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), "***PROVIDER_KEY***");
    }
  }

  for (const [pattern, replacement] of SECRET_REPLACEMENTS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), replacement);
  }

  return result;
}

export function maskVoucherKey(authHeader: string | undefined): string {
  if (!authHeader) return "unknown";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (token.length < 4) return "***";
  return `allotly_sk_***${token.slice(-4)}`;
}
