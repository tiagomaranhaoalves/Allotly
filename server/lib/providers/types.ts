export interface ValidationResult {
  valid: boolean;
  error?: string;
  orgName?: string;
  details?: Record<string, any>;
}

export interface ProviderAdapter {
  provider: "OPENAI" | "ANTHROPIC" | "GOOGLE";
  automationLevel: "FULL_AUTO" | "SEMI_AUTO" | "GUIDED";
  validateAdminKey(apiKey: string): Promise<ValidationResult>;
}
