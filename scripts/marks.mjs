// CleanHearth: white app marks for the Frame home screen, made from the official icons on your own TV.
//
//   node scripts/marks.mjs pull --tv 192.168.1.50            copy the icons of your apps from the TV (SSH as root, as the
//                                                             Homebrew Channel sets it up) into .local/icons/
//   node scripts/marks.mjs make                               turn them into marks in public/marks/ and open a preview
//   node scripts/marks.mjs list --tv 192.168.1.50             show every app on the TV with its id (to fix a match)
//
// Options for pull: --user root (default), --apps "Netflix,Prime Video,..." (default: the list below), --ssh "ssh -p 22"
//
// Choosing the picture for an app, in order:
//   1. .local/marks-src/<app id>.png  - a picture you put there yourself (for example a one-colour logo from the brand's
//                                       press kit). Its transparency is the shape; its colours are ignored.
//   2. .local/icons/<app id>.png      - the app's own icon from the TV, converted the way the TV does it (the shape is
//                                       whatever differs from the icon's background; inner detail becomes cut-outs).
// .local/marks.json can tune one app: {"<app id>": {"mode": "alpha"}} uses the icon's transparency only, {"skip": true}
// leaves the app to the TV's own conversion.
//
// The marks are the apps' own logos, so they stay out of Git (.gitignore): they go into the .ipk you build for your TV.

import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PNG} from 'pngjs';

const root = new URL('..', import.meta.url).pathname;
const LOCAL = process.env.MARKS_LOCAL || join(root, '.local');
const ICONS = join(LOCAL, 'icons');
const SRC = join(LOCAL, 'marks-src');
const OUT = process.env.MARKS_OUT || join(root, 'public', 'marks');
const SIZE = 512;

/** The apps to fetch, each with the titles it can have on an LG TV (compared without case, spaces or punctuation). */
export const WANTED = [
	['Netflix', ['netflix']],
	['Prime Video', ['primevideo', 'amazonprimevideo', 'amazonprime']],
	['YouTube', ['youtube']],
	['Apple TV', ['appletv', 'appletvplus']],
	['HBO Max', ['hbomax', 'max']],
	['Nanomid', ['nanomid', 'nanomidplayer']],
	['Spotify', ['spotify', 'spotifymusicandpodcasts']],
	['DAZN', ['dazn']],
	['ARD', ['ardmediathek', 'ard']],
	['ZDF', ['zdfmediathek', 'zdf']],
	['arte', ['arte', 'artetv']]
];

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i === -1 ? def : process.argv[i + 1]; };
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Picks the TV's app for each wanted name: an exact title first, then a title that starts with it. Pure (tested). */
export function matchApps (points, wanted) {
	const out = [];
	for (const [name, aliases] of wanted) {
		const exact = points.filter((p) => aliases.indexOf(norm(p.title)) !== -1);
		const pick = exact.length ? exact : points.filter((p) => aliases.some((a) => a.length >= 4 && norm(p.title).indexOf(a) === 0));
		out.push({name, found: pick[0] || null, others: pick.slice(1).map((p) => `${p.title} (${p.id})`)});
	}
	return out;
}

function ssh (tv, user, command) {
	const base = (arg('ssh', 'ssh') || 'ssh').split(' ').filter(Boolean);
	return execFileSync(base[0], base.slice(1).concat(['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', `${user}@${tv}`, command]), {maxBuffer: 64 * 1024 * 1024});
}

function launchPoints (tv, user) {
	const text = ssh(tv, user, "luna-send -n 1 -f luna://com.webos.applicationManager/listLaunchPoints '{}'").toString();
	const json = JSON.parse(text.slice(text.indexOf('{')));
	return (json.launchPoints || []).filter((p) => p.id && p.title);
}

function pull () {
	const tv = arg('tv');
	if (!tv) { console.error('Missing --tv <address of the TV>'); process.exit(1); }
	const user = arg('user', 'root');
	const wanted = arg('apps') ? WANTED.filter(([n]) => arg('apps').split(',').map(norm).indexOf(norm(n)) !== -1) : WANTED;
	const points = launchPoints(tv, user);
	mkdirSync(ICONS, {recursive: true});
	for (const m of matchApps(points, wanted)) {
		if (!m.found) { console.log(`--   ${m.name}: not installed on the TV (or another title: run "list")`); continue; }
		const p = m.found;
		const path = [p.largeIcon, p.icon, p.mediumIcon].filter((x) => typeof x === 'string' && x.indexOf('/') === 0)[0];
		if (!path) { console.log(`--   ${m.name}: ${p.id} has no icon file on the TV`); continue; }
		const data = ssh(tv, user, `cat '${path.replace(/'/g, "'\\''")}'`);
		writeFileSync(join(ICONS, `${p.id}.png`), data);
		console.log(`ok   ${m.name}: ${p.title} (${p.id}), ${Math.round(data.length / 1024)} KB` + (m.others.length ? `; also matched: ${m.others.join(', ')}` : ''));
	}
	console.log(`\nIcons are in .local/icons/. Next: node scripts/marks.mjs make`);
}

function list () {
	const tv = arg('tv');
	if (!tv) { console.error('Missing --tv <address of the TV>'); process.exit(1); }
	for (const p of launchPoints(tv, arg('user', 'root')).sort((a, b) => a.title.localeCompare(b.title))) console.log(`${p.title}  ->  ${p.id}`);
}

/** Bilinear resize of RGBA pixels to fit inside size x size (kept centred on a transparent square). */
function fitSquare (png, size) {
	const scale = Math.min(size / png.width, size / png.height);
	const w = Math.max(1, Math.round(png.width * scale));
	const h = Math.max(1, Math.round(png.height * scale));
	const out = new Uint8ClampedArray(size * size * 4);
	const ox = (size - w) >> 1;
	const oy = (size - h) >> 1;
	const src = png.data;
	for (let y = 0; y < h; y++) {
		const sy = Math.min(png.height - 1, (y + 0.5) / scale - 0.5);
		const y0 = Math.max(0, Math.floor(sy)); const y1 = Math.min(png.height - 1, y0 + 1); const fy = Math.max(0, sy - y0);
		for (let x = 0; x < w; x++) {
			const sx = Math.min(png.width - 1, (x + 0.5) / scale - 0.5);
			const x0 = Math.max(0, Math.floor(sx)); const x1 = Math.min(png.width - 1, x0 + 1); const fx = Math.max(0, sx - x0);
			const o = ((y + oy) * size + x + ox) * 4;
			for (let c = 0; c < 4; c++) {
				const a = src[(y0 * png.width + x0) * 4 + c] * (1 - fx) + src[(y0 * png.width + x1) * 4 + c] * fx;
				const b = src[(y1 * png.width + x0) * 4 + c] * (1 - fx) + src[(y1 * png.width + x1) * 4 + c] * fx;
				out[o + c] = Math.round(a * (1 - fy) + b * fy);
			}
		}
	}
	return out;
}

/** The shape's box (alpha above a small floor), padded; null when the picture is empty. Pure (tested). */
export function shapeBox (px, size, pad) {
	let x0 = size, y0 = size, x1 = -1, y1 = -1;
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		if (px[(y * size + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
	}
	if (x1 < 0) return null;
	const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
	return {x: Math.max(0, x0 - p), y: Math.max(0, y0 - p), w: Math.min(size, x1 + p + 1) - Math.max(0, x0 - p), h: Math.min(size, y1 + p + 1) - Math.max(0, y0 - p)};
}

async function make () {
	const lib = join(root, 'node_modules', '.cache-marks-monoicon.mjs');
	await build({entryPoints: [join(root, 'src', 'lib', 'monoicon.ts')], bundle: true, format: 'esm', outfile: lib, platform: 'node', logLevel: 'error'});
	const {monoPixels, smoothAlpha} = await import(lib);
	const tune = existsSync(join(LOCAL, 'marks.json')) ? JSON.parse(readFileSync(join(LOCAL, 'marks.json'), 'utf8')) : {};
	mkdirSync(OUT, {recursive: true});
	const ids = new Set();
	for (const dir of [ICONS, SRC]) if (existsSync(dir)) readdirSync(dir).filter((f) => f.endsWith('.png')).forEach((f) => ids.add(basename(f, '.png')));
	const made = [];
	const rows = [];
	for (const id of [...ids].sort()) {
		const t = tune[id] || {};
		if (t.skip) { console.log(`--   ${id}: skipped (.local/marks.json)`); continue; }
		const own = existsSync(join(SRC, id + '.png'));
		const file = own ? join(SRC, id + '.png') : join(ICONS, id + '.png');
		let png;
		try { png = PNG.sync.read(readFileSync(file)); } catch (e) { console.log(`FAIL ${id}: not a PNG (${e.message})`); continue; }
		const px = fitSquare(png, SIZE);
		if (own || t.mode === 'alpha') { for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = 255; } }
		else monoPixels(px, SIZE, SIZE);
		smoothAlpha(px, SIZE, SIZE);
		const box = shapeBox(px, SIZE, 0.04);
		if (!box) { console.log(`FAIL ${id}: the shape came out empty; try {"mode": "alpha"} or a picture in .local/marks-src/`); continue; }
		const outPng = new PNG({width: box.w, height: box.h});
		for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
			const s = ((y + box.y) * SIZE + x + box.x) * 4;
			const o = (y * box.w + x) * 4;
			outPng.data[o] = 255; outPng.data[o + 1] = 255; outPng.data[o + 2] = 255; outPng.data[o + 3] = px[s + 3];
		}
		writeFileSync(join(OUT, id + '.png'), PNG.sync.write(outPng));
		made.push(id);
		rows.push({id, src: file, from: own ? 'your picture' : t.mode === 'alpha' ? 'icon transparency' : 'icon, converted'});
		console.log(`ok   ${id}: ${box.w}x${box.h} from ${own ? '.local/marks-src' : '.local/icons'}`);
	}
	writeFileSync(join(OUT, 'index.json'), JSON.stringify({marks: made}, null, 2) + '\n');
	const page = `<!DOCTYPE html><meta charset="utf-8"><title>CleanHearth marks</title>
<style>body{margin:0;padding:40px;background:#1b2024 linear-gradient(160deg,#2a3a3f,#101316);color:#fff;font:16px Manrope,system-ui,sans-serif}
h1{font-weight:500}.grid{display:flex;flex-wrap:wrap;gap:18px}.card{width:220px;padding:18px;border-radius:24px;background:rgba(22,26,30,.45);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);text-align:center}
.src{width:72px;height:72px;object-fit:contain;border-radius:12px;background:#000}.mark{width:128px;height:76px;margin:16px auto;background:#fff;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}
.id{font-size:12px;opacity:.6;word-break:break-all}.from{font-size:13px;opacity:.8;margin-top:6px}</style>
<h1>CleanHearth marks (${made.length})</h1><p>Left: the picture used. Right: the mark the Dock and List will draw. Tune one in .local/marks.json, or put your own picture in .local/marks-src/&lt;id&gt;.png, then run make again.</p><div class="grid">` +
		rows.map((r) => {
			const src = 'data:image/png;base64,' + readFileSync(r.src).toString('base64');
			const mark = 'data:image/png;base64,' + readFileSync(join(OUT, r.id + '.png')).toString('base64');
			return `<div class="card"><img class="src" src="${src}"><div class="mark" style="-webkit-mask-image:url('${mark}');mask-image:url('${mark}')"></div><div class="id">${r.id}</div><div class="from">${r.from}</div></div>`;
		}).join('') + '</div>';
	mkdirSync(LOCAL, {recursive: true});
	writeFileSync(join(LOCAL, 'marks-preview.html'), page);
	console.log(`\n${made.length} marks in public/marks/. Preview: .local/marks-preview.html. They go into the next "npm run package".`);
}

export {make};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const cmd = process.argv[2];
	if (cmd === 'pull') pull();
	else if (cmd === 'list') list();
	else if (cmd === 'make') await make();
	else { console.log('Usage: node scripts/marks.mjs pull --tv <address> | list --tv <address> | make'); process.exit(cmd ? 1 : 0); }
}
