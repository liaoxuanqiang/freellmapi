import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, type Tray } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 332;
const HEIGHT = 356;

let popover: BrowserWindow | null = null;

// A Control-Center-style glass panel anchored under the tray icon. Created
// once, then shown/hidden — cheap to keep around (one small renderer) and
// instant to open. Hides on blur like a real menu.
function createPopover(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false, // the panel draws its own soft shadow (transparent margins)
    ...(process.platform === 'darwin'
      ? { vibrancy: 'popover' as const, visualEffectState: 'active' as const }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload-popover.cjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  // Show over fullscreen apps, like every menu bar utility.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, '../renderer/popover.html')).then(() => {
    if (process.platform !== 'darwin') {
      win.webContents.executeJavaScript("document.body.classList.add('no-vibrancy')");
    }
  });

  win.on('blur', () => win.hide());
  win.on('closed', () => {
    popover = null;
  });
  return win;
}

export function getPopoverWindow(): BrowserWindow | null {
  return popover;
}

export function togglePopover(tray: Tray): void {
  if (!popover || popover.isDestroyed()) popover = createPopover();

  if (popover.isVisible()) {
    popover.hide();
    return;
  }

  const b = tray.getBounds();
  // Centered under the icon; tray bounds are in screen coordinates.
  const x = Math.round(b.x + b.width / 2 - WIDTH / 2);
  const y = process.platform === 'darwin'
    ? Math.round(b.y + b.height + 4)
    : Math.round(b.y - HEIGHT - 4); // Windows tray sits at the bottom
  popover.setPosition(x, y, false);
  popover.webContents.send('freeapi:refresh');
  popover.show();
  popover.focus();
}
