import { describe, it, expect } from "vitest";
import { McpToolError, MCP_ERROR_CODES, toMcpRpcError } from "../../server/lib/mcp/errors";

describe("McpToolError", () => {
  it("encodes the canonical code numbers", () => {
    expect(MCP_ERROR_CODES.Unauthorised).toBe(-32001);
    expect(MCP_ERROR_CODES.Forbidden).toBe(-32002);
    expect(MCP_ERROR_CODES.NotFound).toBe(-32004);
    expect(MCP_ERROR_CODES.InsufficientBudget).toBe(-32010);
    expect(MCP_ERROR_CODES.RateLimited).toBe(-32011);
    expect(MCP_ERROR_CODES.ConcurrencyLimited).toBe(-32012);
    expect(MCP_ERROR_CODES.VoucherExpired).toBe(-32013);
    expect(MCP_ERROR_CODES.VoucherAlreadyRedeemed).toBe(-32014);
    expect(MCP_ERROR_CODES.ModelNotAllowed).toBe(-32015);
    expect(MCP_ERROR_CODES.BudgetExceeded).toBe(-32020);
    expect(MCP_ERROR_CODES.ProviderError).toBe(-32030);
    expect(MCP_ERROR_CODES.InvalidInput).toBe(-32100);
  });

  it("attaches a default hint when none provided", () => {
    const err = new McpToolError("Unauthorised", "no token");
    expect(err.code).toBe(-32001);
    expect(err.data.hint).toContain("Authorization");
  });

  it("preserves caller-provided hints and extra fields", () => {
    const err = new McpToolError("BudgetExceeded", "out of budget", {
      hint: "run request_topup",
      remaining_cents: 0,
      required_cents: 50,
    });
    expect(err.data.hint).toBe("run request_topup");
    expect(err.data.remaining_cents).toBe(0);
    expect(err.data.required_cents).toBe(50);
  });

  it("converts cleanly to JSON-RPC error shape", () => {
    const err = new McpToolError("NotFound", "no voucher");
    const rpc = toMcpRpcError(err);
    expect(rpc).toMatchObject({ code: -32004, message: "no voucher" });
    expect(rpc.data.hint).toBeDefined();
  });
});
