export interface ValidationResult {
  valid: boolean;
  error?: string;
  orgName?: string;
  details?: Record<string, any>;
}

export interface ProviderAdapter {
  provider: "OPENAI" | "ANTHROPIC" | "GOOGLE" | "AZURE_OPENAI";
  validateAdminKey(apiKey: string, options?: { baseUrl?: string; deploymentName?: string; apiVersion?: string; endpointMode?: string }): Promise<ValidationResult>;
  translateRequest?(request: any): any;
  translateResponse?(response: any): any;
  extractUsage?(response: any): { inputTokens: number; outputTokens: number };
}
