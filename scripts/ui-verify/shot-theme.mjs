// Screenshot a page in a chosen colour scheme. The plain shot.sh cannot do this:
// the theme follows prefers-color-scheme, which needs CDP to override.
//   node shot-theme.mjs <url> <name> <width> <light|dark>
const [url, name, widthArg, scheme = 'light'] = process.argv.slice(2);
const width = Number(widthArg || 1440);
const PORT = 9334 + (scheme === 'light' ? 0 : 1);
const { spawn } = await import('node:child_process');
const fs = await import('node:fs/promises');

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--window-size=${width},1200`,
  '--user-data-dir=' + (process.env.TEMP || '.') + '/edge-shot-' + scheme,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) { console.error('no devtools target'); edge.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
await send('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile: width < 700 });
await send('Page.navigate', { url });
await sleep(6500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile(`var/shots/${name}.png`, Buffer.from(shot.result.data, 'base64'));
console.log(`  saved: var/shots/${name}.png (${scheme}, ${width}px)`);
ws.close(); edge.kill(); process.exit(0);
