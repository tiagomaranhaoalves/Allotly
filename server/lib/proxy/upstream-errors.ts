import { redact, maskVoucherKey } from "./redactor";

export interface UpstreamErrorDetail {
  status: number;
  code: string | null;
  message: string | null;
  param: string | null;
}

export interface UpstreamErrorResponse {
  allotlyStatus: number;
  errorType: string;
  friendlyMessage: string;
  upstream: UpstreamErrorDetail;
}

function extractAzureOpenAI(body: any): Partial<UpstreamErrorDetail> {
  const err = body?.error;
  if (!err) return {};
  return {
    code: err.code || err.type || null,
    message: err.message || null,
    param: err.param || null,
  };
}

function extractOpenAI(body: any): Partial<UpstreamErrorDetail> {
  const err = body?.error;
  if (!err) return {};
  return {
    code: err.code || err.type || null,
    message: err.message || null,
    param: err.param || null,
  };
}

function extractAnthropic(body: any): Partial<UpstreamErrorDetail> {
  const err = body?.error;
  if (!err) return {};
  return {
    code: err.type || null,
    message: err.message || null,
    param: null,
  };
}

function extractGoogle(body: any): Partial<UpstreamErrorDetail> {
  const errObj = body?.error || body?.[0]?.error;
  if (!errObj) return {};
  return {
    code: errObj.status || errObj.code || null,
    message: errObj.message || null,
    param: null,
  };
}

const extractors: Record<string, (body: any) => Partial<UpstreamErrorDetail>> = {
  AZURE_OPENAI: extractAzureOpenAI,
  OPENAI: extractOpenAI,
  ANTHROPIC: extractAnthropic,
  GOOGLE: extractGoogle,
};

function mapStatus(upstreamStatus: number): { allotlyStatus: number; errorType: string } {
  if (upstreamStatus === 429) {
    return { allotlyStatus: 429, errorType: "upstream_rate_limited" };
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return { allotlyStatus: 502, errorType: "upstream_auth_failed" };
  }
  if (upstreamStatus >= 500) {
    return { allotlyStatus: 502, errorType: "upstream_error" };
  }
  return { allotlyStatus: 400, errorType: "upstream_error" };
}

export function buildUpstreamError(
  provider: string,
  upstreamStatus: number,
  rawBody: string,
  providerKeys: string[] = [],
): UpstreamErrorResponse {
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {}

  const extractor = extractors[provider] || extractOpenAI;
  const extracted = parsed ? extractor(parsed) : {};

  const rawMessage = extracted.message
    || (parsed?.message)
    || (parsed?.error?.status_message)
    || rawBody.trim().slice(0, 500);

  const redactedMessage = redact(String(rawMessage), providerKeys);
  const redactedCode = extracted.code ? redact(String(extracted.code), providerKeys) : null;

  const { allotlyStatus, errorType } = mapStatus(upstreamStatus);

  return {
    allotlyStatus,
    errorType,
    friendlyMessage: "Allotly: upstream provider returned an error.",
    upstream: {
      status: upstreamStatus,
      code: redactedCode,
      message: redactedMessage,
      param: extracted.param || null,
    },
  };
}

export function formatUpstreamLogLine(
  provider: string,
  authHeader: string | undefined,
  model: string,
  upstream: UpstreamErrorDetail,
): string {
  const maskedKey = maskVoucherKey(authHeader);
  const msg = upstream.message ? upstream.message.slice(0, 300) : "no message";
  return `[provider=${provider.toLowerCase()}] [voucher=${maskedKey}] [model=${model}] upstream_status=${upstream.status} upstream_code=${upstream.code || "none"} msg="${msg}"`;
}
