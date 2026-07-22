# Deploy FreeLLMAPI on Vercel (via Docker)

This guide walks you through deploying FreeLLMAPI on Vercel using the provided `Dockerfile.vercel`.

## Prerequisites

- A [Vercel](https://vercel.com) account
- Your FreeLLMAPI code pushed to a GitHub repository
- An `ENCRYPTION_KEY` (generate with `openssl rand -hex 32`)

## Files in this repo

| File | Purpose |
|---|---|
| `Dockerfile.vercel` | Vercel-optimized Dockerfile (based on `Dockerfile`) |
| `vercel.json` | Vercel project configuration (optional) |
| `.vercelignore` | Files to exclude from Vercel upload |

## Deployment Steps

### 1. Push to GitHub

```bash
git add .
git commit -m "Add Vercel deployment config"
git push
```

### 2. Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import your GitHub repository
3. Vercel automatically detects the Dockerfile and selects **Other** as Framework Preset

### 3. Configure Project Settings

In the project configuration screen:

- **Root Directory**: `.` (default, keep as-is)
- **Build and Output Settings** → **Dockerfile Path**: `Dockerfile.vercel`
- **Environment Variables** — **must** add:

| Variable | Value | Required |
|---|---|---|
| `ENCRYPTION_KEY` | `openssl rand -hex 32` output | **Yes** |
| `NODE_ENV` | `production` | Recommended |

Optional environment variables for data persistence:

| Variable | Description |
|---|---|
| `FREEAPI_DB_BACKUP_URL` | HTTP URL to periodically push encrypted DB backups |
| `FREEAPI_DB_BACKUP_KEY` | Separate encryption key for backups (defaults to `ENCRYPTION_KEY`) |
| `FREEAPI_DB_BACKUP_INTERVAL_MS` | Backup interval in ms (default: 300000) |
| `FREEAPI_CONFIG_JSON` | Declarative startup config (inline JSON) — see README |

### 4. Deploy

Click **Deploy**. Vercel will build the Docker image and start the container.

On first deployment, the one-time setup code is printed in the **Vercel deployment logs** — check them under your project dashboard → **Deployments** → click the deployment → **Runtime Logs**. Use this code when creating your admin account via the dashboard.

## Important Notes

### SQLite Data Persistence

**Vercel container filesystems are ephemeral.** The SQLite database at `/app/server/data/freellmapi.db` is lost when the container restarts. This means:

- Provider API keys you add through the dashboard will be lost
- Model configurations, routing profiles, and analytics will reset
- Admin accounts will need to be recreated

**Solutions:**

1. **Encrypted DB backup (recommended)**: Set `FREEAPI_DB_BACKUP_URL` to an HTTP endpoint that accepts `PUT` requests. The server restores the backup on startup and uploads fresh backups periodically.

2. **Declarative startup config**: Set `FREEAPI_CONFIG_JSON` to re-apply keys and settings on every boot:

   ```json
   {
     "keys": [
       { "platform": "groq", "key": "gsk_...", "label": "main" },
       { "platform": "google", "key": "AIza...", "enabled": true }
     ],
     "routing": { "strategy": "balanced" }
   }
   ```

3. **Accept ephemeral storage**: For testing/experimental deployments, reconfigure keys on each deployment cycle.

### Setup Code

When the database is empty (first boot), the server generates a one-time setup code. You need this code to create your admin account:

```
freellmapi setup code: XXXXXX
```

Find it in **Vercel Dashboard** → **Deployments** → select your deployment → **Runtime Logs**.

### Environment Variables

- `ENCRYPTION_KEY` is **mandatory** — without it, provider API keys cannot be encrypted
- Set all environment variables in **Vercel Project Settings** → **Environment Variables**
- Environment variables are available at build time and runtime

### Region Selection

By default, Vercel deploys to `iad1` (Washington, D.C., USA). For better latency to specific LLM providers, consider selecting a region closer to your providers' API endpoints. Set in `vercel.json`:

```json
{
  "regions": ["hkg1"]
}
```

Available regions: `iad1` (US East), `hkg1` (Hong Kong), `gru1` (Brazil), `cdg1` (France), etc.

## Verification

After deployment:

1. **Health check**: Visit `https://<your-project>.vercel.app/api/ping`
   → Expected: `{"status":"ok","timestamp":"..."}`

2. **Dashboard**: Open the Vercel URL in your browser → you should see the FreeLLMAPI dashboard

3. **API test**:
   ```bash
   curl https://<your-project>.vercel.app/v1/chat/completions \
     -H "Authorization: Bearer <your-unified-key>" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "auto",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

## Differences from Dockerfile

| Aspect | `Dockerfile` | `Dockerfile.vercel` |
|---|---|---|
| HEALTHCHECK | Included | Removed (Vercel handles health checks) |
| VOLUME | `/app/server/data` | Removed (Vercel doesn't support VOLUME) |
| PORT default | `ENV PORT=3001` | Not set (app defaults to `process.env.PORT ?? 3001`) |
| Data persistence | Named Docker volume | Ephemeral — use DB backup or declarative config |
| Deployment target | Docker Compose / Docker CLI | Vercel Docker Runtime |

## Troubleshooting

**"Database not initialized" error**: This happens when the SQLite DB file is missing and no backup URL is configured. Set `FREEAPI_CONFIG_JSON` or access the dashboard to re-initialize.

**"Encryption key is required" error**: `ENCRYPTION_KEY` environment variable is not set. Add it in Vercel project settings.

**Container crashes on startup**: Check Vercel deployment logs for the exact error. Common causes:
- Missing or invalid `ENCRYPTION_KEY`
- Insufficient memory (upgrade Vercel plan or check resource limits)

**Dashboard shows no login page**: The app is serving but the one-time setup hasn't been completed. Check logs for the setup code and complete setup via the dashboard URL.
