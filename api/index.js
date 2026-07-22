// Vercel Serverless Function entry point
import '../server/dist/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../server/dist/app.js';
import { initDb } from '../server/dist/db/index.js';
import { loadConfig } from '../server/dist/lib/config.js';
import { applyDeclarativeConfigFromEnv } from '../server/dist/services/declarative-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.FREEAPI_DB_PATH) {
  process.env.FREEAPI_DB_PATH = '/tmp/freellmapi.db';
}

const config = loadConfig();
config.serveStaticAssets = false;
config.clientDist = path.resolve(__dirname, '../client/dist');

initDb(config.dbPath ?? undefined);
applyDeclarativeConfigFromEnv();

const app = createApp(config);
export default app;
