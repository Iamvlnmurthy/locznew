// Ask the rendered page which elements stick out past the viewport, instead of
// reading CSS and guessing. Usage: node measure.mjs <url> [width]
const url = process.argv[2];
const width = Number(process.argv[3] || 390);
const PORT = 9333;
const { spawn } = await import('node:child_process');

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--window-size=${width},1100`, '--user-data-dir=' + (process.env.TEMP || '.') + '/edge-measure',
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
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
// Emulate a real phone: without this the layout viewport is right but the
// device pixel ratio and touch flags are not, and some rules key off them.
await send('Emulation.setDeviceMetricsOverride', {
  width, height: 1100, deviceScaleFactor: 2, mobile: true,
});
await send('Page.navigate', { url });
await sleep(6000);

const expr = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const right = r.right + window.scrollX;
    if (right > vw + 1) {
      const cs = getComputedStyle(el);
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 70),
        right: Math.round(right), w: Math.round(r.width),
        pw: Math.round(el.parentElement ? el.parentElement.getBoundingClientRect().width : 0),
        minW: cs.minWidth, ws: cs.whiteSpace, ov: cs.overflowX, pos: cs.position,
      });
    }
  }
  // The interesting ones are the outermost offenders and the widest.
  out.sort((a, b) => b.right - a.right);
  return JSON.stringify({
    viewport: vw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    count: out.length,
    worst: out.slice(0, 18),
  }, null, 1);
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(r.result?.result?.value ?? JSON.stringify(r).slice(0, 800));
ws.close(); edge.kill();
process.exit(0);
