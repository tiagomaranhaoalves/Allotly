import type { Express } from "express";
import { discoveryHandler } from "./discovery";
import { registerHandler } from "./register";
import { authorizeHandler, consentHandler } from "./authorize";
import { tokenHandler } from "./token";
import { revokeHandler } from "./revoke";
import { listConnectionsHandler, deleteConnectionHandler } from "./connections";

export function mountOAuth(app: Express): void {
  app.get("/.well-known/oauth-authorization-server", discoveryHandler);
  app.post("/oauth/register", registerHandler);
  app.get("/oauth/authorize", authorizeHandler);
  app.post("/oauth/consent", consentHandler);
  app.post("/oauth/token", tokenHandler);
  app.post("/oauth/revoke", revokeHandler);
  app.get("/api/oauth/connections", listConnectionsHandler);
  app.delete("/api/oauth/connections/:clientId", deleteConnectionHandler);
  console.log("[oauth] mounted /.well-known/oauth-authorization-server, /oauth/register, /oauth/authorize, /oauth/consent, /oauth/token, /oauth/revoke, /api/oauth/connections");
}

export { issueAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS, OAUTH_ISSUER } from "./jwt";
export { MCP_AUDIENCE, SUPPORTED_SCOPES, scopeIncludes, parseScopeString } from "./scopes";
export { revokeAllTokensForClientMembership } from "./revoke";
export { listConnectionsHandler, deleteConnectionHandler } from "./connections";
export type { ConnectionRow } from "./connections";
