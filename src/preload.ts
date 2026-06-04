// Built to build/preload.cjs (CommonJS — the reliable preload format).
// Runs in the renderer before any page script: seeds the dashboard session
// token into localStorage so AuthGate's very first /api/auth/status call is
// authenticated. The token arrives via additionalArguments (process.argv),
// which avoids templating strings into executeJavaScript.
import { contextBridge } from 'electron';

const TOKEN_KEY = 'freellmapi_dashboard_token';
const arg = process.argv.find((a) => a.startsWith('--freeapi-token='));
if (arg) {
  try {
    window.localStorage.setItem(TOKEN_KEY, arg.slice('--freeapi-token='.length));
  } catch {
    // localStorage unavailable — the dashboard will show its login screen.
  }
}

// Lets the client adapt its chrome (drag region, traffic-light padding,
// no Sign out) when running inside the desktop shell.
contextBridge.exposeInMainWorld('__FREEAPI_DESKTOP__', true);
