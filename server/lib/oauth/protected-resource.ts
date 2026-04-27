import type { Request, Response } from "express";
import { OAUTH_ISSUER } from "./jwt";
import { MCP_AUDIENCE, SUPPORTED_SCOPES } from "./scopes";

export function protectedResourceHandler(_req: Request, res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", "application/json");
  res.json({
    resource: MCP_AUDIENCE,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: `${OAUTH_ISSUER}/docs`,
  });
}
