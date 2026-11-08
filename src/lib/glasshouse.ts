// CleanHearth always answers the Home button. Glasshouse (github.com/rorygallagher2024/glasshouse) can stay on the TV for
// everything else, but its "Glasshouse Home" would take LG Home's place and compete for the Home button. This reads whether
// it is on and switches it off through Glasshouse's local API: GET /api/home and POST /api/home/disable, answered only for
// requests from the TV itself (127.0.0.1), with a JSON body. We reach it through the Homebrew Channel's root shell (curl or
// wget), so the web page needs no cross-origin access. On webOS 5 and 6 switching it restarts the TV's app manager.

import {exec} from './apps';
import {td} from '../i18n';

/** Where Glasshouse keeps its settings on the TV (its "port" is read from there; 8080 when not set). */
export const GLASSHOUSE_CONFIG = '/var/lib/tvweb/config.json';

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
	if (!j || typeof j !== 'object') return td('glasshouse.noAnswer');
	if (j.ok === true) return '';
	return typeof j.error === 'string' && j.error ? j.error : td('glasshouse.refused');
}

export function glasshouseStatus (): Promise<GlasshouseState> {
	return exec(statusCommand(), 12000).then(parseStatus, () => ({found: false, enabled: false, supported: false}));
}

/** Switches Glasshouse Home on or off (CleanHearth only ever switches it off). Resolves '' when it worked, else why not. */
export function setGlasshouseHome (on: boolean): Promise<string> {
	return exec(switchCommand(on), 50000).then(parseSwitch, (e: Error) => (e && e.message) || td('glasshouse.commandFailed'));
}
