import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, dialog, ipcMain, clipboard } from 'electron';
import { startServer, ensureSessionToken, getUnifiedApiKey } from './server.mjs';
import { loadConfig, saveConfig } from './config.js';
import { buildTray } from './tray.js';
import { openDashboard } from './window.js';
import { todayStats, hourlyRequests, successRateToday } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 31415;

// Lean posture: no GPU process, one instance, menu-bar only.
app.setName('FreeLLMAPI');
app.setPath('userData', path.join(app.getPath('appData'), 'FreeLLMAPI'));
app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let resolvedPort = DEFAULT_PORT;
  let sessionToken = '';

  app.on('second-instance', () => {
    if (sessionToken) openDashboard(resolvedPort, sessionToken);
  });

  // The app lives in the tray; closing the dashboard window must not quit.
  app.on('window-all-closed', () => {});

  // ── popover IPC ──────────────────────────────────────────────────────────
  ipcMain.handle('freeapi:snapshot', () => {
    const s = todayStats();
    return {
      port: resolvedPort,
      requests: s.requests,
      tokens: s.tokens,
      lastModel: s.lastModel,
      successRate: successRateToday(),
      hourly: hourlyRequests(),
      loginItem: app.getLoginItemSettings().openAtLogin,
    };
  });
  ipcMain.handle('freeapi:open-dashboard', () => openDashboard(resolvedPort, sessionToken));
  ipcMain.handle('freeapi:copy-base-url', () => clipboard.writeText(`http://127.0.0.1:${resolvedPort}/v1`));
  ipcMain.handle('freeapi:copy-api-key', () => clipboard.writeText(getUnifiedApiKey()));
  ipcMain.handle('freeapi:set-login-item', (_e, open: boolean) => app.setLoginItemSettings({ openAtLogin: open }));
  ipcMain.handle('freeapi:quit', () => app.quit());

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide();

    const cfg = loadConfig();
    const dbPath = path.join(app.getPath('userData'), 'freeapi.db');
    // Packaged: client/dist ships in extraResources (Resources/client-dist).
    // Dev (electron . from desktop/): use the repo's client/dist.
    const clientDist = app.isPackaged
      ? path.join(process.resourcesPath, 'client-dist')
      : path.resolve(__dirname, '../../client/dist');

    try {
      const { port } = await startServer({
        dbPath,
        clientDist,
        host: '127.0.0.1',
        preferredPort: cfg.port ?? DEFAULT_PORT,
      });
      resolvedPort = port;
      saveConfig({ ...cfg, port });
      sessionToken = ensureSessionToken();
      const tray = buildTray(port, sessionToken);
      console.log(`[desktop] FreeLLMAPI running on http://127.0.0.1:${port}`);

      // Dev-only UI verification: FREEAPI_SHOT=1 opens the popover and the
      // dashboard, captures both to /tmp, and quits. Never set when packaged.
      if (process.env.FREEAPI_SHOT && !app.isPackaged) {
        const fs = await import('node:fs');
        const { togglePopover, getPopoverWindow } = await import('./popover.js');
        const { getDashboardWindow } = await import('./window.js');
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        await sleep(800);
        togglePopover(tray);
        await sleep(1500);
        const pop = await getPopoverWindow()?.webContents.capturePage();
        if (pop) fs.writeFileSync('/tmp/freeapi-popover.png', pop.toPNG());
        openDashboard(port, sessionToken);
        await sleep(3000);
        const dash = await getDashboardWindow()?.webContents.capturePage();
        if (dash) fs.writeFileSync('/tmp/freeapi-dashboard.png', dash.toPNG());
        app.quit();
      }
    } catch (err: any) {
      dialog.showErrorBox(
        'FreeLLMAPI failed to start',
        err?.message ?? String(err),
      );
      app.quit();
    }
  });
}
