import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// SPA routes that should be served with HTTP 200.
// Dynamic segments use a simple :param notation; prefix entries ending in /*
// match any sub-path.
const SPA_ROUTES: Array<string | RegExp> = [
  "/",
  "/login",
  "/signup",
  "/redeem",
  "/forgot-password",
  "/reset-password",
  "/docs",
  "/mcp/docs",
  "/docs/mcp",
  "/about",
  "/careers",
  "/contact",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
  "/subprocessors",
  "/arena",
  "/components",
  /^\/invite\/[^/]+$/,
  /^\/oauth\//,
  /^\/dashboard(\/.*)?$/,
  /^\/admin(\/.*)?$/,
];

function matchesSpaRoute(urlPath: string): boolean {
  for (const pattern of SPA_ROUTES) {
    if (typeof pattern === "string") {
      if (urlPath === pattern) return true;
    } else {
      if (pattern.test(urlPath)) return true;
    }
  }
  return false;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // Serve index.html for known SPA routes with HTTP 200.
  // All other paths get a real HTTP 404 so crawlers and search engines
  // see the correct status code instead of a misleading 200.
  app.use("/{*path}", (req, res) => {
    const urlPath = req.path;
    const status = matchesSpaRoute(urlPath) ? 200 : 404;
    res.status(status).sendFile(path.resolve(distPath, "index.html"));
  });
}
