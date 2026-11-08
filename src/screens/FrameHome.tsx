import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import type {TileModel} from '../components/Tile';
import {Glyph} from '../components/Glyph';
import {useKeys, type NavKey} from '../hooks/useKeys';
import {useOkPress} from '../hooks/useOkPress';
import {useClock} from '../hooks/useClock';
import {timeParts, type TimeFormat} from '../lib/clock';
import {monoFor} from '../lib/monoicon';
import {loadMarks, markFor, onMarks} from '../lib/marks';
import {initialStepState, stepDecision, type ScrollSpeed} from '../lib/scrollspeed';
import {t as tt} from '../i18n';

// The Frame home screen: a photo, a small clock and the apps, in the spirit of CleanFrame (see THIRD_PARTY_NOTICES.md).
//
//   Dock  - the apps sit on a glass bar near the bottom; the clock is top left and the controls (LG Home, System Settings,
//           Settings) top right. Left/Right walk the bar, Up goes to the controls, Down or Back comes back to the apps.
//   List  - the apps are large names stacked on the left; the clock is top right and the controls bottom right.
//           Up/Down walk the list, Right goes to the controls, Left or Back comes back.
//
// OK opens, holding OK opens the app's menu (hide, re-order, uninstall), Back on the apps opens Recent apps, exactly as on
// the classic home row. Focus only moves: it never opens anything. Movement uses transforms and opacity only (no live blur),
// so it stays smooth on older TVs.

export type FrameLayout = 'dock' | 'list';

/** The tiles that are drawn as quiet corner controls instead of apps. */
export const CONTROL_KEYS = ['lg-home', 'system-settings', 'settings'];

interface Props {
	layout: FrameLayout;
	items: TileModel[];
	showClock: boolean;
	timeFormat: TimeFormat;
	scrollSpeed: ScrollSpeed;
	oledShift: boolean;
	active: boolean;
	paused?: boolean;
	onActivate: (item: TileModel) => void;
	onLongPress?: (item: TileModel) => void;
	onBack: () => void;
	wake?: number;
	homeKey?: string | null;
	focus?: {key: string; seq: number};
	moveMode?: {picked: string | null} | null;
	tileKeys?: string[];
	onMovePick?: (key: string | null) => void;
	onMoveStep?: (key: string, dir: 'left' | 'right') => void;
	onMoveExit?: () => void;
}

/** px at 1080p: the spacing of the dock's items and of the list's rows */
const DOCK_STEP = 300;
const LIST_STEP = 132;
/** how many list rows fit between the fades */
const LIST_VISIBLE = 6;

const SHIFT_STEPS = [{x: 0, y: 0}, {x: 4, y: 2}, {x: 8, y: 0}, {x: 4, y: -2}, {x: 0, y: -4}, {x: -4, y: -2}, {x: -8, y: 0}, {x: -4, y: 2}];

function useShift (on: boolean): {x: number; y: number} {
	const [i, setI] = useState(0);
	useEffect(() => {
		if (!on) return undefined;
		const timer = window.setInterval(() => setI((n) => (n + 1) % SHIFT_STEPS.length), 60000);
		return () => window.clearInterval(timer);
	}, [on]);
	return on ? SHIFT_STEPS[i] : SHIFT_STEPS[0];
}

/** The app's mark: the hand-checked one bundled for it (lib/marks.ts), else its icon as a white shape (made once per icon
 *  and kept), or its own picture until the shape is ready. A picture the owner chose for the app (a data: address) wins. */
function AppMark ({item}: {item: TileModel}) {
	const [, redraw] = useState(0);
	const again = useCallback(() => redraw((n) => n + 1), []);
	const own = !!item.imageUrl && item.imageUrl.indexOf('data:') === 0;
	const mark = own ? null : markFor(item.key);
	if (mark) return <span class="frame-mark frame-mark--mono frame-mark--bundled" style={`-webkit-mask-image:url("${mark}")`} />;
	if (item.imageUrl) {
		const mono = monoFor(item.imageUrl, again);
		if (mono) return <span class="frame-mark frame-mark--mono" style={`-webkit-mask-image:url("${mono}")`} />;
		return <img class="frame-mark frame-mark--image" src={item.imageUrl} alt="" />;
	}
	if (item.glyph) return <span class="frame-mark frame-mark--glyph"><Glyph name={item.glyph} /></span>;
	if (item.glyphImageUrl) return <img class="frame-mark frame-mark--image frame-mark--input" src={item.glyphImageUrl} alt="" />;
	return <span class="frame-mark frame-mark--letter">{(item.label || '?').charAt(0).toUpperCase()}</span>;
}

function Clock ({format, paused}: {format: TimeFormat; paused?: boolean}) {
	const now = useClock(paused);
	return <div class="frame-clock">{timeParts(now, format).time}</div>;
}

/** Index of `key` in `list`, or -1. */
function indexOfKey (list: TileModel[], key: string | null | undefined): number {
	if (!key) return -1;
	for (let i = 0; i < list.length; i++) if (list[i].key === key) return i;
	return -1;
}

let marksAsked = false;

export function FrameHome ({layout, items, showClock, timeFormat, scrollSpeed, oledShift, active, paused, onActivate, onLongPress, onBack, wake, homeKey, focus, moveMode, tileKeys, onMovePick, onMoveStep, onMoveExit}: Props) {
	const apps = items.filter((it) => CONTROL_KEYS.indexOf(it.key) === -1);
	const controls = CONTROL_KEYS.map((k) => items.filter((it) => it.key === k)[0]).filter(Boolean) as TileModel[];

	const [zone, setZone] = useState<'apps' | 'controls'>('apps');
	const [appAt, setAppAt] = useState(0);
	const [ctlAt, setCtlAt] = useState(0);
	const at = Math.max(0, Math.min(apps.length - 1, appAt));
	const ctl = Math.max(0, Math.min(controls.length - 1, ctlAt));
	const inControls = zone === 'controls' && controls.length > 0;
	const selected = inControls ? controls[ctl] : apps[at];
	const shift = useShift(oledShift && !paused);
	const [, marksSeen] = useState(0);
	useEffect(() => {
		const stop = onMarks(() => marksSeen((n) => n + 1));
		if (!marksAsked) { marksAsked = true; loadMarks(); }
		return stop;
	}, []);

	// The key handler is registered once per layout, so it reads everything through refs.
	const live = useRef({apps, controls, at, ctl, inControls, moveMode, tileKeys, onBack, onMovePick, onMoveStep, onMoveExit});
	live.current = {apps, controls, at, ctl, inControls, moveMode, tileKeys, onBack, onMovePick, onMoveStep, onMoveExit};
	const step = useRef(initialStepState());
	const speed = useRef(scrollSpeed);
	speed.current = scrollSpeed;
	const pending = useRef<string | null>(null);

	// Home pressed (the launcher comes to the front): back to the apps, on the wanted app or the first.
	useEffect(() => {
		const i = indexOfKey(apps, homeKey);
		pending.current = i === -1 ? homeKey || null : null;
		setZone('apps');
		setAppAt(i === -1 ? 0 : i);
		if (live.current.moveMode && live.current.onMoveExit) live.current.onMoveExit();
	}, [wake]);                                   // eslint-disable-line react-hooks/exhaustive-deps
	// Right after a start the app list may still be loading: place the wanted app once it appears, unless a key came first.
	useEffect(() => {
		if (!pending.current) return;
		const i = indexOfKey(apps, pending.current);
		if (i !== -1) { pending.current = null; setAppAt(i); }
	}, [items]);                                  // eslint-disable-line react-hooks/exhaustive-deps
	// A tile was moved: the focus follows it.
	useEffect(() => {
		if (!focus) return;
		const i = indexOfKey(apps, focus.key);
		if (i !== -1) { setZone('apps'); setAppAt(i); }
	}, [focus && focus.seq]);                     // eslint-disable-line react-hooks/exhaustive-deps

	const handleKey = useCallback((key: NavKey, event?: KeyboardEvent): boolean => {
		pending.current = null;
		const s = live.current;
		const dock = layout === 'dock';
		const along = dock ? (key === 'left' ? -1 : key === 'right' ? 1 : 0) : (key === 'up' ? -1 : key === 'down' ? 1 : 0);
		const toControls = dock ? key === 'up' : key === 'right';
		const toApps = dock ? key === 'down' : key === 'left';
		const ctlAlong = dock ? along : (key === 'up' ? -1 : key === 'down' ? 1 : 0);

		if (along !== 0 || (s.inControls && ctlAlong !== 0)) {       // a held key repeats faster than the eye: thin the repeats out
			const d = stepDecision(step.current, Date.now(), !!(event && event.repeat), s.moveMode && s.moveMode.picked ? 'slow' : speed.current);
			step.current = d.state;
			if (!d.move) return true;
		}

		const mv = s.moveMode;
		if (mv) {                                    // move mode: OK picks up and puts down (see useOkPress below)
			if (key === 'back') {
				if (mv.picked) { if (s.onMovePick) s.onMovePick(null); } else if (s.onMoveExit) s.onMoveExit();
				return true;
			}
			if (along !== 0) {
				if (mv.picked) { if (s.onMoveStep) s.onMoveStep(mv.picked, along < 0 ? 'left' : 'right'); }
				else setAppAt((i) => Math.max(0, Math.min(s.apps.length - 1, i + along)));
			}
			return true;
		}

		if (s.inControls) {
			if (key === 'back' || toApps) { setZone('apps'); return true; }
			if (ctlAlong !== 0) setCtlAt((i) => Math.max(0, Math.min(s.controls.length - 1, i + ctlAlong)));
			return true;
		}
		if (key === 'back') { s.onBack(); return true; }
		if (toControls && s.controls.length) { setZone('controls'); return true; }
		if (along !== 0) setAppAt((i) => Math.max(0, Math.min(s.apps.length - 1, i + along)));    // no wrapping, as on CleanFrame
		return true;
	}, [layout]);

	useKeys(handleKey, active);
	useOkPress({
		onPress: () => {
			const s = live.current;
			const item = s.inControls ? s.controls[s.ctl] : s.apps[s.at];
			if (!item) return;
			const mv = s.moveMode;
			if (mv) {
				if (!s.onMovePick) return;
				if (mv.picked) s.onMovePick(null);
				else if (s.tileKeys && s.tileKeys.indexOf(item.key) !== -1) s.onMovePick(item.key);
				return;
			}
			onActivate(item);
		},
		onLongPress: () => { if (selected && onLongPress && !moveMode) onLongPress(selected); }
	}, active);

	const picked = moveMode ? moveMode.picked : null;
	const shiftStyle = `transform:translate3d(${shift.x}px,${shift.y}px,0)`;
	const point = (z: 'apps' | 'controls', i: number) => () => { pending.current = null; setZone(z); if (z === 'apps') setAppAt(i); else setCtlAt(i); };
	const open = (item: TileModel) => () => { if (!moveMode) onActivate(item); };

	const controlNodes = controls.map((c, i) => (
		<div key={c.key} class={`frame-control${inControls && i === ctl ? ' frame-control--focused' : ''}`} onMouseEnter={point('controls', i)} onClick={open(c)}>
			{layout === 'list' && <span class="frame-control__label">{c.label}</span>}
			<span class="frame-control__icon">{c.glyph ? <Glyph name={c.glyph} /> : null}</span>
			{layout === 'dock' && <span class="frame-control__label">{c.label}</span>}
		</div>
	));

	let body;
	if (layout === 'dock') {
		// keep the focused app in view: the bar's content slides, the focus plate stays put relative to its app
		const viewport = 1620;
		const total = apps.length * DOCK_STEP;
		const maxScroll = Math.max(0, total - viewport);
		const scroll = Math.max(0, Math.min(maxScroll, at * DOCK_STEP - (viewport - DOCK_STEP) / 2));
		const fadeL = scroll > 0;
		const fadeR = scroll < maxScroll;
		body = (
			<div class="frame-dock">
				<div class={`frame-dock__viewport${fadeL ? ' frame-dock__viewport--fade-l' : ''}${fadeR ? ' frame-dock__viewport--fade-r' : ''}${fadeL && fadeR ? ' frame-dock__viewport--fade-lr' : ''}`}>
					<div class="frame-dock__track" style={`transform:translate3d(${-scroll}px,0,0)`}>
						<div class={`frame-plate${inControls ? ' frame-plate--away' : ''}`} style={`transform:translate3d(${at * DOCK_STEP}px,0,0)`} />
						{apps.map((a, i) => (
							<div key={a.key} class={`frame-app${i === at && !inControls ? ' frame-app--focused' : ''}${a.key === picked ? ' frame-app--picked' : ''}${a.disconnected ? ' frame-app--dimmed' : ''}`} style={`left:${i * DOCK_STEP}px`} onMouseEnter={point('apps', i)} onClick={open(a)}>
								<AppMark item={a} />
								<span class="frame-app__label">{a.label}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	} else {
		const first = Math.max(0, Math.min(Math.max(0, apps.length - LIST_VISIBLE), at - Math.floor(LIST_VISIBLE / 2) + 1));
		const fadeT = first > 0;
		const fadeB = first + LIST_VISIBLE < apps.length;
		body = (
			<div class={`frame-list${fadeT ? ' frame-list--fade-t' : ''}${fadeB ? ' frame-list--fade-b' : ''}${fadeT && fadeB ? ' frame-list--fade-tb' : ''}`}>
				<div class="frame-list__track" style={`transform:translate3d(0,${-first * LIST_STEP}px,0)`}>
					{apps.map((a, i) => (
						<div key={a.key} class={`frame-row${i === at && !inControls ? ' frame-row--focused' : ''}${a.key === picked ? ' frame-row--picked' : ''}${a.disconnected ? ' frame-row--dimmed' : ''}`} style={`top:${i * LIST_STEP}px`} onMouseEnter={point('apps', i)} onClick={open(a)}>
							<AppMark item={a} />
							<span class="frame-row__label">{a.label}</span>
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div class={`screen frame frame--${layout}${active ? '' : ' screen--away'}${inControls ? ' frame--controls' : ''}`}>
			<div class="frame__scrim" />
			<div class="frame__content" style={shiftStyle}>
				{showClock && !moveMode && <Clock format={timeFormat} paused={paused} />}
				{moveMode && <div class="frame-hint">{tt('move.hint')}</div>}
				<div class="frame-controls">{controlNodes}</div>
				{body}
			</div>
		</div>
	);
}
