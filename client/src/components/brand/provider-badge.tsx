const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10A37F",
  ANTHROPIC: "#D4A574",
  GOOGLE: "#4285F4",
};

const PROVIDER_NAMES: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google",
};

export function ProviderBadge({ provider, className = "" }: { provider: string; className?: string }) {
  const color = PROVIDER_COLORS[provider] || "#6366F1";
  const name = PROVIDER_NAMES[provider] || provider;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className}`} data-testid={`badge-provider-${provider.toLowerCase()}`}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
