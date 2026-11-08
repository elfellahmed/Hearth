// CleanHearth: who answers the remote's Home button, CleanHearth or Glasshouse Home.
//
// Glasshouse (github.com/rorygallagher2024/glasshouse) runs a small server on a rooted TV. Its "Glasshouse Home" takes
// LG Home's place, and its local API switches that on and off: POST /api/home/enable and /api/home/disable, answered
// only for requests from the TV itself (127.0.0.1), with a JSON body. We reach it through the Homebrew Channel's root
// shell (curl or wget), so the web page needs no cross-origin access.
//
// Handing Home to Glasshouse: CleanHearth's own ways of taking Home (the helper script and the Home button mapping) are
// switched off first, and remembered, then Glasshouse Home is switched on. Taking it back: Glasshouse Home is switched off,
// then the remembered helper and mapping are put back. On webOS 5 and 6 switching Glasshouse Home restarts the TV's app
// manager, which can close this page halfway; the step that is left is saved first and finished at the next start.

import {exec} from './apps';
import {td} from '../i18n';

/** Where Glasshouse keeps its settings on the TV (its "port" is read from there; 8080 when not set). */
export const GLASSHOUSE_CONFIG = '/var/lib/tvweb/config.json';

export type HomeButton = 'cleanhearth' | 'glasshouse';
export const HOME_BUTTONS: readonly HomeButton[] = ['cleanhearth', 'glasshouse'];

/** What CleanHearth had switched on before Home was handed to Glasshouse, to be put back when it is taken back. */
export interface Handoff {
	/** the "Replace LG Home with a helper script" watcher was running */
	helper: boolean;
	/** remote buttons that opened CleanHearth (Input Hook mapping) */
	codes: number[];
}

/** A step that was cut short (the app manager restarted under the page): finished at the next start. */
export type PendingStep = '' | 'restore';

export interface GlasshouseState {
	/** Glasshouse answered on this TV */
	found: boolean;
	/** Glasshouse Home is in LG Home's place now */
	enabled: boolean;
	/** this TV's webOS can have Glasshouse Home */
	supported: boolean;
}

/** Shell: the port Glasshouse listens on, in $P. */
const PORT = `P=$(sed -n 's/^[[:space:]]*"port"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' ${GLASSHOUSE_CONFIG} 2>/dev/null | head -n 1); [ -n "$P" ] || P=8080`;

/** Shell: GET /api/home from Glasshouse on this TV; prints the JSON answer, or nothing. */
export function statusCommand (): string {
	return `${PORT}; U="http://127.0.0.1:$P/api/home"; curl -s -m 8 "$U" 2>/dev/null || wget -qO- -T 8 "$U" 2>/dev/null`;
}

/** Shell: POST /api/home/enable or /disable with an empty JSON body; prints the JSON answer, or nothing. */
export function switchCommand (on: boolean): string {
	const path = on ? 'enable' : 'disable';
	return `${PORT}; U="http://127.0.0.1:$P/api/home/${path}"; ` +
		`curl -s -m 40 -X POST -H 'Content-Type: application/json' -d '{}' "$U" 2>/dev/null || ` +
		`wget -qO- -T 40 --header='Content-Type: application/json' --post-data='{}' "$U" 2>/dev/null`;
}

/** Reads Glasshouse's answer to GET /api/home. Pure. */
export function parseStatus (out: string): GlasshouseState {
	let j: {enabled?: unknown; supported?: unknown} | null = null;
	try { j = JSON.parse(out); } catch { j = null; }
	if (!j || typeof j !== 'object') return {found: false, enabled: false, supported: false};
	const sup = j.supported as {ok?: unknown} | boolean | undefined;      // Glasshouse answers {ok, reason}
	const supported = typeof sup === 'object' && sup !== null ? sup.ok !== false : sup !== false;
	return {found: true, enabled: j.enabled === true, supported};
}

/** Reads Glasshouse's answer to enable/disable. Pure: '' when it worked, else why not. */
export function parseSwitch (out: string): string {
	let j: {ok?: unknown; error?: unknown} | null = null;
	try { j = JSON.parse(out); } catch { j = null; }
	if (!j || typeof j !== 'object') return td('handoff.noAnswer');
	if (j.ok === true) return '';
	return typeof j.error === 'string' && j.error ? j.error : td('handoff.refused');
}

export function glasshouseStatus (): Promise<GlasshouseState> {
	return exec(statusCommand(), 12000).then(parseStatus, () => ({found: false, enabled: false, supported: false}));
}

/** Switches Glasshouse Home on or off. Resolves '' when it worked, else why not. */
export function setGlasshouseHome (on: boolean): Promise<string> {
	return exec(switchCommand(on), 50000).then(parseSwitch, (e: Error) => (e && e.message) || td('handoff.commandFailed'));
}
