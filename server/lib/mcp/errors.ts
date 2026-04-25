export const MCP_ERROR_CODES = {
  Unauthorised: -32001,
  Forbidden: -32002,
  NotFound: -32004,
  InsufficientBudget: -32010,
  RateLimited: -32011,
  ConcurrencyLimited: -32012,
  VoucherExpired: -32013,
  VoucherAlreadyRedeemed: -32014,
  ModelNotAllowed: -32015,
  BudgetExceeded: -32020,
  ProviderError: -32030,
  InvalidInput: -32100,
} as const;

export type McpErrorCode = keyof typeof MCP_ERROR_CODES;

export class McpToolError extends Error {
  code: number;
  data: Record<string, any>;
  constructor(name: McpErrorCode, message: string, data: Record<string, any> = {}) {
    super(message);
    this.code = MCP_ERROR_CODES[name];
    this.data = { message, hint: data.hint || defaultHint(name), ...data };
    this.name = name;
  }
}

function defaultHint(code: McpErrorCode): string {
  switch (code) {
    case "Unauthorised": return "Set Authorization: Bearer allotly_sk_... or Authorization: Bearer ALLOT-XXXX-XXXX-XXXX.";
    case "Forbidden": return "Your key does not allow this action. Contact the issuing admin.";
    case "NotFound": return "The requested resource was not found.";
    case "InsufficientBudget": return "Reduce request size, pick a cheaper model, or run request_topup.";
    case "RateLimited": return "Wait a few seconds and try again.";
    case "ConcurrencyLimited": return "Wait for in-flight requests to finish before sending more.";
    case "VoucherExpired": return "This voucher has expired. Ask the issuing admin for a new one.";
    case "VoucherAlreadyRedeemed": return "This voucher has already been redeemed by a different recipient.";
    case "ModelNotAllowed": return "Run list_available_models to see what your key allows.";
    case "BudgetExceeded": return "Run request_topup to ask the admin for more budget.";
    case "ProviderError": return "The upstream AI provider returned an error. Try again or use a different model.";
    case "InvalidInput": return "Check the tool's input schema and retry.";
    default: return "See documentation.";
  }
}

export function toMcpRpcError(err: McpToolError): { code: number; message: string; data: Record<string, any> } {
  return { code: err.code, message: err.message, data: err.data };
}
