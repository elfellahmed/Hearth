// Tests for the app marks (scripts/marks.mjs and src/lib/marks.ts): matching the wanted apps to the TV's titles, and making
// marks from real icons into a scratch folder.   Run: npm test
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';

const scratch = mkdtempSync(join(tmpdir(), 'marks-'));
process.env.MARKS_LOCAL = join(scratch, 'local');
process.env.MARKS_OUT = join(scratch, 'out');
const m = await import('./marks.mjs');

let fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', msg, ok ? '' : `(${JSON.stringify(a)} != ${JSON.stringify(b)})`); };

// ---- matching titles ----
const points = [
	{id: 'netflix', title: 'Netflix'}, {id: 'amazon', title: 'Prime Video'}, {id: 'youtube.leanback.v4', title: 'YouTube'},
	{id: 'youtube.kids', title: 'YouTube Kids'}, {id: 'com.apple.appletv', title: 'Apple TV'}, {id: 'com.wbd.max', title: 'Max'},
	{id: 'spotify-beehive', title: 'Spotify - Music and Podcasts'}, {id: 'com.dazn', title: 'DAZN'}, {id: 'de.ard', title: 'ARD Mediathek'},
	{id: 'de.zdf', title: 'ZDFmediathek'}, {id: 'tv.arte', title: 'ARTE'}, {id: 'maxdome', title: 'Maxdome'}
];
const got = m.matchApps(points, m.WANTED);
const ids = Object.fromEntries(got.map((g) => [g.name, g.found ? g.found.id : null]));
eq(ids, {'Netflix': 'netflix', 'Prime Video': 'amazon', 'YouTube': 'youtube.leanback.v4', 'Apple TV': 'com.apple.appletv', 'HBO Max': 'com.wbd.max', 'Nanomid': null,
	'Spotify': 'spotify-beehive', 'DAZN': 'com.dazn', 'ARD': 'de.ard', 'ZDF': 'de.zdf', 'arte': 'tv.arte'}, 'every wanted app is found by its LG title (Nanomid not installed here)');
eq(got.find((g) => g.name === 'YouTube').others, [], 'YouTube: the exact title wins, YouTube Kids is not taken');
eq(got.find((g) => g.name === 'HBO Max').others, [], '"Max" matches exactly and Maxdome is not taken (short names only match exactly)');
eq(m.WANTED.length, 11, 'the eleven apps asked for');

// ---- making marks from real icons ----
const icons = join(process.env.MARKS_LOCAL, 'icons');
mkdirSync(icons, {recursive: true});
const bundled = new URL('../public/icons/apps/', import.meta.url).pathname;
copyFileSync(join(bundled, 'youtube.leanback.v4.png'), join(icons, 'youtube.leanback.v4.png'));
copyFileSync(join(bundled, 'com.apple.appletv.png'), join(icons, 'com.apple.appletv.png'));
// a hand-picked one-colour logo (transparent background): its transparency is the shape
const own = new PNG({width: 40, height: 20});
for (let y = 0; y < 20; y++) for (let x = 0; x < 40; x++) { const o = (y * 40 + x) * 4; own.data[o] = 200; own.data[o + 1] = 10; own.data[o + 2] = 10; own.data[o + 3] = x > 5 && x < 35 && y > 4 && y < 16 ? 255 : 0; }
mkdirSync(join(process.env.MARKS_LOCAL, 'marks-src'), {recursive: true});
writeFileSync(join(process.env.MARKS_LOCAL, 'marks-src', 'tv.arte.png'), PNG.sync.write(own));
const log = console.log; console.log = () => {};
await m.make();
console.log = log;
const index = JSON.parse(readFileSync(join(process.env.MARKS_OUT, 'index.json'), 'utf8'));
eq(index.marks, ['com.apple.appletv', 'tv.arte', 'youtube.leanback.v4'], 'index.json lists the marks made');
const read = (id) => PNG.sync.read(readFileSync(join(process.env.MARKS_OUT, id + '.png')));
const yt = read('youtube.leanback.v4');
let white = true, solid = 0, clear = 0;
for (let i = 0; i < yt.data.length; i += 4) { if (yt.data[i] !== 255 || yt.data[i + 1] !== 255 || yt.data[i + 2] !== 255) white = false; if (yt.data[i + 3] > 200) solid++; if (yt.data[i + 3] < 30) clear++; }
eq(white, true, 'a mark is white everywhere (its shape is in the transparency)');
eq(solid > 0 && clear > 0, true, 'and has both shape and holes or margin');
const arte = read('tv.arte');
eq([arte.width > arte.height, arte.data[(Math.floor(arte.height / 2) * arte.width + Math.floor(arte.width / 2)) * 4 + 3] > 200], [true, true], 'a picture from marks-src keeps its own shape (wide bar, solid in the middle) and is cropped to it');
eq(existsSync(join(process.env.MARKS_LOCAL, 'marks-preview.html')), true, 'a preview page is written');

process.exit(fail ? 1 : 0);
