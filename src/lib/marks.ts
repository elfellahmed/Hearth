// CleanHearth: hand-checked white app marks for the Frame home screen.
//
// `npm run marks` (scripts/marks.mjs) makes them from the official icons on the owner's own TV and writes
// public/marks/<app id>.png plus public/marks/index.json. Those files stay out of Git (they are the apps' own logos);
// they are packed into the .ipk the owner builds. When there is a mark for an app, the Frame home screen draws it
// instead of converting the icon on the TV. A picture the owner chose for an app (Settings -> Apps -> hold OK) still wins.

const DIR = 'marks/';
let known: Record<string, string> = {};
let version = 0;
const listeners: (() => void)[] = [];

/** Reads marks/index.json once (a missing file means no marks). Calls back the components waiting for it. */
export function loadMarks (): void {
	if (typeof XMLHttpRequest === 'undefined') return;
	try {
		const request = new XMLHttpRequest();
		request.open('GET', DIR + 'index.json', true);
		request.onload = () => {
			if (request.status !== 0 && (request.status < 200 || request.status >= 300)) return;
			let list: unknown = null;
			try { list = JSON.parse(request.responseText); } catch { list = null; }
			const ids = list && typeof list === 'object' && (list as {marks?: unknown}).marks instanceof Array ? (list as {marks: unknown[]}).marks : [];
			const next: Record<string, string> = {};
			for (let i = 0; i < ids.length; i++) {
				const id = ids[i];
				if (typeof id === 'string' && /^[A-Za-z0-9._-]+$/.test(id)) next[id] = DIR + id + '.png';
			}
			known = next;
			version++;
			for (let i = 0; i < listeners.length; i++) listeners[i]();
		};
		request.send();
	} catch { /* no marks */ }
}

/** The bundled mark for this app id, or null. */
export function markFor (id: string): string | null {
	return Object.prototype.hasOwnProperty.call(known, id) ? known[id] : null;
}

export function marksVersion (): number { return version; }

/** Called once the list has been read (or read again). */
export function onMarks (fn: () => void): () => void {
	listeners.push(fn);
	return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
}
