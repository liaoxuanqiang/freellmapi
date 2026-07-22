// Vercel Serverless Function entry point
// Wraps the Express app so Vercel can serve it as a Node.js serverless function.
//
// Build order:
//   1. npm run build (server tsc → server/dist/ + client vite → client/dist/)
//   2. Vercel uses this file as the serverless function handler
//
// Routing (vercel.json):
//   /api/*, /v1/*, /mcp/* → this function
//   Static SPA files       → served directly by Vercel
//   Everything else        → SPA fallback → this function

import '../server/dist/env.js';

import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../server/dist/app.js';
import { initDb } from '../server/dist/db/index.js';
import { loadConfig } from '../server/dist/lib/config.js';
import { applyDeclarativeConfigFromEnv } from '../server/dist/services/declarative-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel's serverless filesystem is read-only except /tmp.
// Use /tmp for the SQLite database so it stays writable.
// Note: /tmp is ephemeral — data is lost on cold starts.
// Configure FREEAPI_DB_BACKUP_* env vars for persistence.
if (!process.env.FREEAPI_DB_PATH) {
  process.env.FREEAPI_DB_PATH = '/tmp/freellmapi.db';
}

const config = loadConfig();

// Vercel serves the static SPA (client/dist/) directly via outputDirectory,
// so we disable the Express app's own static file serving to avoid conflicts.
config.serveStaticAssets = false;

initDb(config.dbPath ?? undefined);
applyDeclarativeConfigFromEnv();

const app = createApp(config);

export default app;
