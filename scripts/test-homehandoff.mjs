// Tests for the Home button hand-over to Glasshouse Home (src/lib/homehandoff.ts): the answers are read right, and the real
// shell commands reach a look-alike Glasshouse server with the right method, path and Content-Type.   Run: npm test
import {build} from 'esbuild';
import {createServer} from 'http';
import {mkdtempSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

const out = new URL('../node_modules/.cache-homehandoff-test.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/homehandoff.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error',
  plugins: [{name: 'stub', setup(b) { b.onResolve({filter: /\.\/apps$/}, (a) => ({path: a.path, namespace: 'stub'})); b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve("");', loader: 'js'})); }}]});
const h = await import(out);

let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', m, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

// ---- reading the answers ----
eq(h.parseStatus(''), {found: false, enabled: false, supported: false}, 'no answer: Glasshouse not found');
eq(h.parseStatus('<html>'), {found: false, enabled: false, supported: false}, 'not JSON: not found');
eq(h.parseStatus('{"enabled":true,"supported":{"ok":true}}'), {found: true, enabled: true, supported: true}, 'Glasshouse Home on');
eq(h.parseStatus('{"enabled":false,"supported":{"ok":false,"reason":"webOS 2"}}'), {found: true, enabled: false, supported: false}, 'unsupported TV');
eq(h.parseSwitch('{"ok":true}'), '', 'switch worked');
eq(h.parseSwitch('{"ok":false,"error":"the TV would not make Glasshouse Home its Home"}'), 'the TV would not make Glasshouse Home its Home', 'switch refused: its reason');
eq(h.parseSwitch(''), 'no answer from Glasshouse', 'switch: no answer');

// ---- the real commands against a look-alike server (port read from a config file, as on the TV) ----
const seen = [];
let enabled = false;
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    seen.push(`${req.method} ${req.url} ${req.headers['content-type'] || '-'} ${body}`);
    if (req.method === 'GET' && req.url === '/api/home') { res.end(JSON.stringify({enabled, supported: {ok: true}})); return; }
    if (req.method === 'POST' && (req.headers['content-type'] || '').indexOf('application/json') !== 0) { res.statusCode = 415; res.end('{"ok":false}'); return; }
    if (req.method === 'POST' && req.url === '/api/home/enable') { enabled = true; res.end('{"ok":true}'); return; }
    if (req.method === 'POST' && req.url === '/api/home/disable') { enabled = false; res.end('{"ok":true}'); return; }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const dir = mkdtempSync(join(tmpdir(), 'gh-'));
const cfg = join(dir, 'config.json');
writeFileSync(cfg, `{\n  "host": "0.0.0.0",\n  "port": ${port},\n  "mqtt": {\n    "port": 1883\n  }\n}\n`);
const runAsync = (cmd) => new Promise((resolve, reject) => {
  import('child_process').then(({exec}) => exec(cmd.split(h.GLASSHOUSE_CONFIG).join(cfg), {shell: '/bin/sh'}, (e, so) => (e ? reject(e) : resolve(so))));
});
eq(h.parseStatus(await runAsync(h.statusCommand())), {found: true, enabled: false, supported: true}, 'status command reads the server on the configured port (not the MQTT port)');
eq(h.parseSwitch(await runAsync(h.switchCommand(true))), '', 'enable command accepted');
eq(enabled, true, 'and Glasshouse Home is on');
eq(h.parseStatus(await runAsync(h.statusCommand())).enabled, true, 'status now says on');
eq(h.parseSwitch(await runAsync(h.switchCommand(false))), '', 'disable command accepted');
eq(enabled, false, 'and it is off again');
eq(seen.filter((l) => l.indexOf('POST') === 0).every((l) => l.indexOf(' application/json {}') > 0), true, 'POSTs carry Content-Type application/json and an empty JSON body (Glasshouse refuses other types)');
server.close();

// ---- Settings: the row, and the rows it greys out ----
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
const pOut = new URL('../node_modules/.cache-homehandoff-prefs.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/prefs.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: pOut, platform: 'node', logLevel: 'error', plugins: [{name: 'stub-apps', setup(b) { b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'})); b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'})); }}]});
const p = await import(pOut);
const sOut = new URL('../node_modules/.cache-homehandoff-storage.mjs', import.meta.url).pathname;
await build({entryPoints: [new URL('../src/lib/storage.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: sOut, platform: 'node', logLevel: 'error', plugins: [{name: 'stub-apps', setup(b) { b.onResolve({filter: /\.\/apps$/}, () => ({path: 'apps-stub', namespace: 'stub'})); b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const shellQuote = (v) => v;', loader: 'js'})); }}]});
const s = await import(sOut);
const c0 = s.DEFAULT_CONFIG;
eq(c0.homeButton, 'cleanhearth', 'a fresh install: Home opens CleanHearth');
const row = (c) => p.optionsFor('system', c, {homeHook: null, homeApp: null, root: 'yes'}).find((o) => o.id === 'homeButton');
eq(row(c0) && row(c0).valueText, 'CleanHearth', 'System lists Home button opens: CleanHearth');
eq(row({...c0, homeButton: 'glasshouse'}).valueText, 'Glasshouse Home', 'and Glasshouse Home once handed over');
const gh = {...c0, homeButton: 'glasshouse'};
eq(['replaceHome', 'samHome', 'homeApp', 'homeKey'].map((id) => !!p.disabledReason(id, {homeHook: null, homeApp: null}, gh)), [true, true, true, true], 'while Glasshouse has Home, CleanHearth\'s own takeover rows are greyed out');
eq(p.disabledReason('replaceHome', {homeHook: null, homeApp: null}, c0), null, 'and usable again when CleanHearth has it');

process.exit(fail ? 1 : 0);
