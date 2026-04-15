import { describe, it, expect } from "vitest";
import { buildUpstreamError, formatUpstreamLogLine } from "../server/lib/proxy/upstream-errors";

describe("buildUpstreamError", () => {
  it("extracts Azure DeploymentNotFound 404 → Allotly 400", () => {
    const body = JSON.stringify({
      error: {
        code: "DeploymentNotFound",
        message: "The API deployment for this resource does not exist. If you created the deployment within the last 5 minutes, please wait a moment and try again.",
      },
    });
    const result = buildUpstreamError("AZURE_OPENAI", 404, body);
    expect(result.allotlyStatus).toBe(400);
    expect(result.upstream.status).toBe(404);
    expect(result.upstream.code).toBe("DeploymentNotFound");
    expect(result.upstream.message).toContain("does not exist");
    expect(result.errorType).toBe("upstream_error");
  });

  it("redacts Azure key echoed in 401 message", () => {
    const azureKey = "abc123def456ghi789jkl012mno345pq";
    const body = JSON.stringify({
      error: {
        code: "Unauthorized",
        message: `Access denied due to invalid subscription key ${azureKey}. Make sure to provide a valid key.`,
      },
    });
    const result = buildUpstreamError("AZURE_OPENAI", 401, body, [azureKey]);
    expect(result.allotlyStatus).toBe(502);
    expect(result.errorType).toBe("upstream_auth_failed");
    expect(result.upstream.message).not.toContain(azureKey);
    expect(result.upstream.message).toContain("***PROVIDER_KEY***");
  });

  it("extracts OpenAI invalid_request_error with param", () => {
    const body = JSON.stringify({
      error: {
        type: "invalid_request_error",
        message: "Unrecognized request argument supplied: max_tokens",
        param: "max_tokens",
        code: "invalid_request_error",
      },
    });
    const result = buildUpstreamError("OPENAI", 400, body);
    expect(result.allotlyStatus).toBe(400);
    expect(result.upstream.code).toBe("invalid_request_error");
    expect(result.upstream.param).toBe("max_tokens");
    expect(result.upstream.message).toContain("max_tokens");
  });

  it("extracts Anthropic error type and message", () => {
    const body = JSON.stringify({
      error: {
        type: "invalid_request_error",
        message: "max_tokens: 100000 > 8192, which is the maximum allowed",
      },
    });
    const result = buildUpstreamError("ANTHROPIC", 400, body);
    expect(result.allotlyStatus).toBe(400);
    expect(result.upstream.code).toBe("invalid_request_error");
    expect(result.upstream.message).toContain("max_tokens");
    expect(result.upstream.param).toBeNull();
  });

  it("extracts Google error status and message", () => {
    const body = JSON.stringify({
      error: {
        status: "NOT_FOUND",
        message: "Model not found: gemini-nonexistent",
      },
    });
    const result = buildUpstreamError("GOOGLE", 404, body);
    expect(result.allotlyStatus).toBe(400);
    expect(result.upstream.code).toBe("NOT_FOUND");
    expect(result.upstream.message).toContain("gemini-nonexistent");
  });

  it("handles non-JSON upstream body gracefully", () => {
    const rawBody = "<html>Bad Gateway</html>";
    const result = buildUpstreamError("OPENAI", 502, rawBody);
    expect(result.allotlyStatus).toBe(502);
    expect(result.upstream.message).toContain("Bad Gateway");
    expect(result.upstream.code).toBeNull();
  });

  it("truncates very long raw bodies to 500 chars", () => {
    const longBody = "x".repeat(1000);
    const result = buildUpstreamError("OPENAI", 500, longBody);
    expect(result.upstream.message!.length).toBeLessThanOrEqual(500);
  });

  it("maps 429 → Allotly 429", () => {
    const body = JSON.stringify({ error: { message: "Rate limit exceeded" } });
    const result = buildUpstreamError("OPENAI", 429, body);
    expect(result.allotlyStatus).toBe(429);
    expect(result.errorType).toBe("upstream_rate_limited");
  });

  it("maps 401/403 → Allotly 502 upstream_auth_failed", () => {
    const body = JSON.stringify({ error: { message: "Unauthorized" } });
    const result401 = buildUpstreamError("OPENAI", 401, body);
    expect(result401.allotlyStatus).toBe(502);
    expect(result401.errorType).toBe("upstream_auth_failed");

    const result403 = buildUpstreamError("OPENAI", 403, body);
    expect(result403.allotlyStatus).toBe(502);
    expect(result403.errorType).toBe("upstream_auth_failed");
  });

  it("maps 5xx → Allotly 502", () => {
    const body = JSON.stringify({ error: { message: "Internal error" } });
    const result = buildUpstreamError("OPENAI", 503, body);
    expect(result.allotlyStatus).toBe(502);
  });

  it("extracts Google array-form error (body[0].error)", () => {
    const body = JSON.stringify([
      { error: { status: "INVALID_ARGUMENT", message: "Request payload size exceeds the limit" } },
    ]);
    const result = buildUpstreamError("GOOGLE", 400, body);
    expect(result.allotlyStatus).toBe(400);
    expect(result.upstream.code).toBe("INVALID_ARGUMENT");
    expect(result.upstream.message).toContain("payload size");
  });
});

describe("formatUpstreamLogLine", () => {
  it("formats a log line with masked voucher", () => {
    const line = formatUpstreamLogLine(
      "AZURE_OPENAI",
      "Bearer allotly_sk_test_abcd1234",
      "azure/gpt-5",
      { status: 404, code: "DeploymentNotFound", message: "Not found", param: null },
    );
    expect(line).toContain("[provider=azure_openai]");
    expect(line).toContain("[voucher=allotly_sk_***1234]");
    expect(line).toContain("[model=azure/gpt-5]");
    expect(line).toContain("upstream_status=404");
    expect(line).toContain("upstream_code=DeploymentNotFound");
    expect(line).not.toContain("allotly_sk_test_abcd1234");
  });

  it("TEST 9 — error.message contains upstream code and message for SDK consumers", () => {
    const body = JSON.stringify({
      error: {
        code: "invalid_parameter_combination",
        message: "Setting 'max_tokens' and 'max_completion_tokens' at the same time is not supported.",
        param: "max_tokens",
      },
    });
    const result = buildUpstreamError("OPENAI", 400, body);
    expect(result.friendlyMessage).toContain("invalid_parameter_combination");
    expect(result.friendlyMessage).toContain("max_tokens");
    expect(result.friendlyMessage).toContain("openai");
    expect(result.upstream.code).toBe("invalid_parameter_combination");
    expect(result.upstream.message).toContain("max_completion_tokens");
    expect(result.upstream.param).toBe("max_tokens");
  });

  it("does not leak secrets in log line message", () => {
    const providerKey = "sk-proj-abc123XYZ456789012345678";
    const upstream = {
      status: 401,
      code: "invalid_api_key",
      message: `Invalid key provided: ${providerKey}`,
      param: null,
    };
    const redactedUpstream = buildUpstreamError("OPENAI", 401, JSON.stringify({
      error: { code: "invalid_api_key", message: `Invalid key provided: ${providerKey}` },
    }), [providerKey]);
    const line = formatUpstreamLogLine("OPENAI", "Bearer allotly_sk_secret9999", "gpt-4o", redactedUpstream.upstream);
    expect(line).not.toContain(providerKey);
    expect(line).not.toContain("allotly_sk_secret9999");
  });
});
