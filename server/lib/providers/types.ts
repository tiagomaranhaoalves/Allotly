export interface ValidationResult {
  valid: boolean;
  error?: string;
  orgName?: string;
  details?: Record<string, any>;
}

export interface ProviderAdapter {
  provider: "OPENAI" | "ANTHROPIC" | "GOOGLE";
  validateAdminKey(apiKey: string): Promise<ValidationResult>;
  translateRequest?(request: any): any;
  translateResponse?(response: any): any;
  extractUsage?(response: any): { inputTokens: number; outputTokens: number };
}
