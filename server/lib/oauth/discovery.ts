import type { Request, Response } from "express";
import { OAUTH_ISSUER } from "./jwt";
import { SUPPORTED_SCOPES } from "./scopes";

export function discoveryHandler(_req: Request, res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    issuer: OAUTH_ISSUER,
    authorization_endpoint: `${OAUTH_ISSUER}/oauth/authorize`,
    token_endpoint: `${OAUTH_ISSUER}/oauth/token`,
    registration_endpoint: `${OAUTH_ISSUER}/oauth/register`,
    revocation_endpoint: `${OAUTH_ISSUER}/oauth/revoke`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
    service_documentation: `${OAUTH_ISSUER}/dashboard/connect`,
  });
}
