// Writes a release into the two lists the TV reads, after `npm run package` built build/<id>_<version>_all.ipk:
//   repo/apps.json     - the Homebrew Channel repository (what it installs and offers as an update)
//   repo/updates.json  - CleanHearth's own Settings -> System -> Updates list
//
//   node scripts/release-manifest.mjs --repo elfellahmed/Hearth [--notes "first line|second line"] [--date 2026-11-08]
//
// The release workflow (.github/workflows/release.yml) runs it when a v* tag is pushed, then commits the two files to main.
import {createHash} from 'node:crypto';
import {readFileSync, statSync, writeFileSync} from 'node:fs';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i === -1 ? def : process.argv[i + 1]; };
const repo = arg('repo', process.env.GITHUB_REPOSITORY);
if (!repo) { console.error('Missing --repo <owner>/<name>'); process.exit(1); }

const appinfo = JSON.parse(readFileSync('public/appinfo.json', 'utf8'));
const {id, version, title, appDescription} = appinfo;
const ipk = `build/${id}_${version}_all.ipk`;
const data = readFileSync(ipk);
const sha256 = createHash('sha256').update(data).digest('hex');
const size = statSync(ipk).size;
const ipkUrl = `https://github.com/${repo}/releases/download/v${version}/${id}_${version}_all.ipk`;
const raw = `https://raw.githubusercontent.com/${repo}/main`;

const apps = {
	paging: {page: 1, count: 1, maxPage: 1, itemsTotal: 1},
	packages: [{
		id, title,
		iconUri: `${raw}/public/largeIcon.png`,
		shortDescription: 'A quiet home screen: a photo, a small clock and your apps, as a Dock or a List.',
		fullDescriptionUrl: `${raw}/repo/description.html`,
		manifest: {id, version, type: 'web', title, appDescription, iconUri: `${raw}/public/largeIcon.png`, sourceUrl: `https://github.com/${repo}`,
			rootRequired: true, ipkUrl, ipkHash: {sha256}, ipkSize: size}
	}]
};
writeFileSync('repo/apps.json', JSON.stringify(apps, null, 2) + '\n');

const updates = JSON.parse(readFileSync('repo/updates.json', 'utf8'));
const notes = (arg('notes', '') || '').split('|').map((s) => s.trim()).filter(Boolean);
const entry = {version, date: arg('date', new Date().toISOString().slice(0, 10)), summary: notes.length ? notes : [`CleanHearth ${version}`], ipkUrl, sha256, size};
updates.versions = [entry].concat((updates.versions || []).filter((v) => v.version !== version));
writeFileSync('repo/updates.json', JSON.stringify(updates, null, 2) + '\n');
console.log(`repo/apps.json and repo/updates.json now offer ${id} ${version} (${size} bytes, sha256 ${sha256.slice(0, 12)}…)`);
