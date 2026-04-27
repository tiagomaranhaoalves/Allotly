import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { startJobScheduler } from './lib/jobs/scheduler';
import { seedModelPricing } from './lib/seed-models';
import { pool } from './db';
import { assertSecretReady as assertOAuthSecretReady } from './lib/oauth/jwt';
import { waitForRedisReady } from './lib/redis';

if (process.env.REPLIT_DEPLOYMENT === "1") {
  assertOAuthSecretReady();
}

const app = express();
app.set("trust proxy", 1);

let appReady = false;
app.get("/", (req, res, next) => {
  if (appReady) return next();
  res.status(200).send("Starting...");
});

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.use((req, res, next) => {
  if (appReady) return next();
  if (req.path === "/" || req.path === "/healthz") return next();
  res.setHeader("Retry-After", "30");
  return res.status(503).json({
    error: {
      code: "starting",
      message: "Server is still initializing. Try again in ~30s.",
    },
  });
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
const httpServer = createServer(app);

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  console.log(`Server listening on port ${port}`);
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    console.log('Webhook configured:', JSON.stringify(webhookResult?.webhook?.url || webhookResult?.url || 'setup complete'));

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use((req, res, next) => {
  if (req.method === 'OPTIONS' && req.path.startsWith('/api/v1/')) {
    return res.sendStatus(204);
  }
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Browsers and some clients still hit /favicon.ico even when the page links
// /favicon.svg. Redirect rather than ship a duplicate ICO asset.
// Registered before the SPA catch-all so it wins.
app.get("/favicon.ico", (_req, res) => res.redirect(301, "/favicon.svg"));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Production: rejects on missing REDIS_URL or 10s connect timeout.
    // Outer catch calls process.exit(1) since the HTTP server is already
    // listening and an unhandled rejection would leave it serving 503s.
    await waitForRedisReady();

    try {
      const migResult = await (pool as any).query(
        `UPDATE provider_connections SET azure_api_version = NULL WHERE provider = 'AZURE_OPENAI' AND azure_api_version = '2024-10-21'`
      );
      if (migResult.rowCount > 0) {
        console.log(`[migration] Cleared stale azure_api_version='2024-10-21' on ${migResult.rowCount} connection(s)`);
      }
    } catch (e: any) {
      console.error("[migration] azure api-version cleanup failed:", e.message);
    }

    await initStripe();
    await seedModelPricing();
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        return next(err);
      }

      if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
        return res.status(400).json({
          error: {
            code: "invalid_request",
            message: "Invalid JSON in request body",
            type: "allotly_error",
          },
        });
      }

      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    appReady = true;
    log(`serving on port ${port}`);
    startJobScheduler();
  } catch (err: any) {
    console.error("[boot] Fatal error during initialization:", err?.message ?? err);
    process.exit(1);
  }
})();
