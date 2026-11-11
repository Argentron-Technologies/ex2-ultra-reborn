'use strict';
'require baseclass';
'require rpc';
'require ui';

/* Shared styles, icons, helpers and RPC calls for the NAS pages. */

const CSS = `
.nas {
	/* Uses the NAS OS theme tokens when present, with fallbacks for other themes. */
	--nas-card-bg: var(--nos-card-bg, #ffffff);
	--nas-raised: var(--nos-raised, #f3f4f6);
	--nas-line: var(--nos-line, #e5e7eb);
	--nas-btn-line: var(--nos-btn-line, rgba(0,0,0,.14));
	--nas-text: var(--nos-text, #1b1d21);
	--nas-muted: var(--nos-muted, #6b7280);
	--nas-track: var(--nos-track, #e5e7eb);
	--nas-accent: var(--nos-accent, #1f9d74);
	--nas-accent-2: color-mix(in srgb, var(--nas-accent) 55%, #fff);
	--nas-accent-text: var(--nos-accent-text, #137a59);
	--nas-accent-soft: var(--nos-accent-soft, rgba(31,157,116,.1));
	--nas-on-accent: var(--nos-on-accent, #fff);
	--nas-tint: var(--nos-tint, rgba(31,157,116,.08));
	--nas-ok: var(--nos-ok, #1b8a5a);
	--nas-warn: var(--nos-warn, #a46200);
	--nas-bad: var(--nos-bad, #c33333);
	--nas-shadow: var(--nos-shadow, 0 1px 2px rgba(0,0,0,.06), 0 10px 26px -18px rgba(0,0,0,.25));
	--nas-tab-bg: var(--nos-tab-bg, #fff);
	--nas-r: var(--nos-r, 16px);
	--nas-r-s: var(--nos-r-s, 12px);
	--nas-mono: var(--nos-mono, ui-monospace, Menlo, monospace);
	font-size: 14px; line-height: 1.45; margin-bottom: 24px; color: var(--nas-text);
}
:root[data-darkmode="true"] .nas {
	--nas-card-bg: var(--nos-card-bg, #1d2025); --nas-raised: var(--nos-raised, #262a31); --nas-line: var(--nos-line, #30343c);
	--nas-text: var(--nos-text, #e9ebee); --nas-muted: var(--nos-muted, #9aa1ab); --nas-track: var(--nos-track, #2a2e35);
	--nas-accent: var(--nos-accent, #8ee6c4); --nas-accent-text: var(--nos-accent-text, #9eecd0); --nas-on-accent: var(--nos-on-accent, #0b1d16);
	--nas-accent-2: color-mix(in srgb, var(--nas-accent) 55%, #fff);
	--nas-ok: var(--nos-ok, #5fd39a); --nas-warn: var(--nos-warn, #f0c060); --nas-bad: var(--nos-bad, #ff8080);
}
.nas * { box-sizing: border-box; }
.nas-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 0 0 20px; }
.nas-head h2 { margin: 0; font-size: 26px; font-weight: 650; letter-spacing: -.02em; border: 0; padding: 0; }
.nas-head p { margin: 4px 0 0; color: var(--nas-muted); }
.nas-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.nas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.nas-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 16px; }
.nas-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; }
.nas-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 16px; }
.nas-card { position: relative; background: var(--nas-card-bg); border: 0; border-radius: var(--nas-r); padding: 20px; box-shadow: var(--nas-shadow); min-width: 0; }
.nas-card h4, .nas-k { margin: 0 0 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--nas-muted); border: 0; padding: 0; }
.nas-card h3 { margin: 0 0 10px; font-size: 17px; font-weight: 600; letter-spacing: -.01em; border: 0; padding: 0; }
.nas-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
.nas-card-head h3 { margin: 0; }
.nas-card-head a { font-size: 13px; font-weight: 600; color: var(--nas-accent-text); }
.nas-section-title { margin: 28px 0 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--nas-muted); }

/* hero */
.nas-hero { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; padding: 28px 32px; margin-bottom: 16px; overflow: hidden;
	background: radial-gradient(520px 340px at 88% 40%, var(--nas-tint), transparent 70%), var(--nas-card-bg); }
.nas-hero-art { flex: none; filter: drop-shadow(0 16px 22px rgba(0,0,0,.25)); }
.nas-hero-main { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.nas-hero-main h1 { margin: 0; font-size: 40px; line-height: 1.05; font-weight: 650; letter-spacing: -.025em; color: var(--nas-text); }
.nas-hero-main h1 span { color: var(--nas-accent-text); }
.nas-hero .nas-ring { width: 196px; height: 196px; margin-left: auto; }
.nas-hero .nas-ring b { font-size: 36px; }
.nas-hero .nas-ring small { font-size: 12.5px; }

.nas-tile { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 40px; height: 40px; border-radius: var(--nas-r-s);
	background: var(--nas-accent-soft); color: var(--nas-accent-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nas-accent) 22%, transparent); }
.nas-tile svg { width: 20px; height: 20px; }
.nas-tile-ico { width: 20px; height: 20px; }
.nas-tile.green { background: color-mix(in srgb, var(--nas-ok) 14%, transparent); color: var(--nas-ok); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nas-ok) 25%, transparent); }
.nas-tile.orange { background: color-mix(in srgb, var(--nas-warn) 15%, transparent); color: var(--nas-warn); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nas-warn) 25%, transparent); }
.nas-tile.purple { background: var(--nas-raised); color: var(--nas-text); box-shadow: inset 0 0 0 1px var(--nas-line); }
.nas-tile.grey { background: var(--nas-raised); color: var(--nas-muted); box-shadow: inset 0 0 0 1px var(--nas-line); }

.nas-pill { display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap;
	background: var(--nas-raised); color: var(--nas-muted); }
.nas-pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent); }
.nas-pill.plain::before { display: none; }
.nas-pill.ok { background: color-mix(in srgb, var(--nas-ok) 13%, transparent); color: var(--nas-ok); }
.nas-pill.warn { background: color-mix(in srgb, var(--nas-warn) 15%, transparent); color: var(--nas-warn); }
.nas-pill.bad { background: color-mix(in srgb, var(--nas-bad) 14%, transparent); color: var(--nas-bad); }
.nas-pill.info { background: var(--nas-accent-soft); color: var(--nas-accent-text); }
.nas-led { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; background: currentColor;
	box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent), 0 0 10px color-mix(in srgb, currentColor 60%, transparent); }
.nas-led.ok { color: var(--nas-ok); } .nas-led.warn { color: var(--nas-warn); } .nas-led.bad { color: var(--nas-bad); } .nas-led.off { color: var(--nas-muted); box-shadow: none; opacity: .6; }
.nas-state { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.nas-state.ok { color: var(--nas-ok); } .nas-state.warn { color: var(--nas-warn); } .nas-state.bad { color: var(--nas-bad); } .nas-state.off { color: var(--nas-muted); }

.nas-kv { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--nas-line); }
.nas-kv:first-of-type { border-top: 0; }
.nas-kv > span:first-child { color: var(--nas-muted); }
.nas-kv > span:last-child { font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.nas-bar { height: 8px; border-radius: 99px; background: var(--nas-track); overflow: hidden; margin: 8px 0 4px; }
.nas-bar > div { height: 100%; border-radius: 99px; background: var(--nas-accent); transition: width .6s ease; }
.nas-bar.ok > div { background: var(--nas-ok); } .nas-bar.warn > div { background: var(--nas-warn); } .nas-bar.bad > div { background: var(--nas-bad); }

.nas-ring-wrap { display: flex; align-items: center; gap: 18px; }
.nas-ring { position: relative; width: 112px; height: 112px; flex: none; }
.nas-ring svg { display: block; }
.nas-ring .nas-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.nas-ring .nas-ring-label b { font-size: 22px; font-weight: 700; font-family: var(--nas-mono); letter-spacing: -.03em; line-height: 1.1; }
.nas-ring .nas-ring-label small { color: var(--nas-muted); font-size: 11.5px; }

.nas-num { font-family: var(--nas-mono); font-weight: 700; letter-spacing: -.03em; font-size: 28px; line-height: 1.15; }
.nas-num small { font-size: 15px; color: var(--nas-muted); font-weight: 600; letter-spacing: 0; }
.nas-big { font-size: 24px; font-weight: 700; font-family: var(--nas-mono); letter-spacing: -.03em; }
.nas-muted { color: var(--nas-muted); }
.nas-small { font-size: 12.5px; }
.nas-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
.nas-row .nas-grow, .nas-grow { flex: 1; min-width: 0; }
.nas-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nas-name { font-weight: 600; font-size: 15px; }
.nas-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.nas-chip { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 99px; font-size: 13px; background: var(--nas-raised); color: var(--nas-text); }
.nas-chip b { font-weight: 600; }
.nas-chip-btn { border: 1px solid transparent; cursor: pointer; font: inherit; line-height: inherit; }
.nas-chip-btn .nas-ico { width: 14px; height: 14px; opacity: .55; }
.nas-chip-btn:hover { border-color: var(--nas-btn-line); }
.nas-chip-btn:hover .nas-ico { opacity: 1; }
.nas-usb-part { padding: 12px 0 2px; border-top: 1px solid var(--nas-line); display: flex; flex-direction: column; gap: 6px; }
.nas-usb-part:first-of-type { border-top: 0; }
.nas-card-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--nas-line); }
.nas-card-foot .btn { flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: nowrap; }
.nas-card-foot .nas-btn-label { overflow: hidden; text-overflow: ellipsis; }
.nas-card-foot .nas-ico { flex: none; }

.nas-spark { display: block; width: 100%; height: 38px; margin-top: 4px; }
.nas-meter { display: flex; gap: 4px; align-items: flex-end; height: 22px; margin-top: 4px; }
.nas-meter span { flex: 1; border-radius: 3px; background: var(--nas-track); }
.nas-meter span.on { background: var(--nas-accent); }
.nas-baypair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }
.nas-baypair div { padding: 8px 10px; border-radius: 10px; font-size: 12.5px; font-weight: 600; background: var(--nas-accent-soft); color: var(--nas-text); }
.nas-baypair div.empty { background: transparent; border: 1px dashed var(--nas-btn-line); color: var(--nas-muted); }
.nas-baypair div.bad { background: color-mix(in srgb, var(--nas-bad) 14%, transparent); }

/* chart */
.nas-chart-head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 24px; margin-bottom: 10px; }
.nas-legend { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--nas-muted); font-weight: 600; }
.nas-legend i { width: 14px; height: 3px; border-radius: 2px; background: var(--nas-accent); display: inline-block; }
.nas-legend i.alt { background: var(--nas-muted); }
.nas-chart { position: relative; }
.nas-chart svg { display: block; width: 100%; height: 170px; overflow: visible; }
.nas-dot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--nas-accent); box-shadow: 0 0 0 2px var(--nos-card, #fff); pointer-events: none; }
.nas-dot.alt { width: 8px; height: 8px; margin: -4px 0 0 -4px; background: var(--nas-muted); }
.nas-ylab { position: absolute; left: 0; font-size: 11px; font-family: var(--nas-mono); color: var(--nas-muted); transform: translateY(-120%); pointer-events: none; }
.nas-chart .nas-tip { position: absolute; top: 0; pointer-events: none; background: var(--nas-card-bg); box-shadow: var(--nas-shadow), 0 0 0 1px var(--nas-line);
	border-radius: 10px; padding: 8px 10px; font-size: 12.5px; white-space: nowrap; transform: translateX(-50%); display: none; z-index: 2; }
.nas-chart .nas-tip b { font-family: var(--nas-mono); }
.nas-axis { display: flex; justify-content: space-between; color: var(--nas-muted); font-size: 12px; margin-top: 6px; }

.nas-list-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--nas-line); }
.nas-list-row:first-of-type { border-top: 0; }

.nas-bay { position: relative; }
.nas-bay.empty { background: transparent; box-shadow: inset 0 0 0 1.5px var(--nas-btn-line); display: flex; flex-direction: column; align-items: center; justify-content: center;
	min-height: 220px; color: var(--nas-muted); text-align: center; gap: 6px; }
.nas-bay.empty .nas-tile { margin-bottom: 6px; }
.nas-bay-label { position: absolute; top: 18px; right: 20px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--nas-muted); }
.nas-avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 42px; height: 42px; border-radius: 50%;
	color: #fff; font-weight: 700; font-size: 15px; letter-spacing: .02em; }
.nas-avatar.sm { width: 26px; height: 26px; font-size: 11px; }
.nas-avstack { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.nas-avitem { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 3px; border-radius: 99px; background: var(--nas-raised); font-size: 12.5px; }
.nas-avitem em { font-style: normal; font-size: 11px; font-weight: 700; color: var(--nas-muted); }
.nas-empty { text-align: center; padding: 56px 20px; color: var(--nas-muted); border-radius: var(--nas-r); box-shadow: inset 0 0 0 1.5px var(--nas-btn-line); }
.nas-empty svg { width: 40px; height: 40px; opacity: .55; margin-bottom: 8px; }
.nas-btn-danger { color: var(--nas-bad) !important; border-color: color-mix(in srgb, var(--nas-bad) 40%, transparent) !important; }
.nas-ico { display: inline-flex; width: 16px; height: 16px; margin-right: 2px; }
.nas-form { display: flex; flex-direction: column; gap: 14px; margin: 6px 0 4px; }
.nas-field label { display: block; font-weight: 600; margin-bottom: 6px; }
.nas-field input[type=text], .nas-field input[type=password], .nas-field input[type=number], .nas-field select { width: 100%; max-width: 100%; }
.nas-field .nas-hint { color: var(--nas-muted); font-size: 12.5px; margin-top: 5px; }
.nas-error { color: var(--nas-bad); font-weight: 600; min-height: 1em; }
.nas-access { width: 100%; border-collapse: collapse; }
.nas-access td { padding: 9px 4px; border-top: 1px solid var(--nas-line); vertical-align: middle; }
.nas-access tr:first-child td { border-top: 0; }
.nas-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: color-mix(in srgb, var(--nas-text) 6%, transparent); }
.nas-seg button { border: 0; border-radius: 8px; margin: 0; padding: 6px 11px; background: transparent; color: var(--nas-muted); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.nas-seg button.on { background: var(--nas-tab-bg); color: var(--nas-text); box-shadow: inset 0 1px 0 var(--nos-tab-hi, #fff), 0 1px 2px var(--nos-tab-sh, rgba(0,0,0,.12)); }
.nas-seg button.on::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--nas-accent); }
.nas-seg button.on.ro::before { background: var(--nas-warn); }
.nas-seg button.on.no::before { background: var(--nas-muted); }
.nas-switch { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: var(--nas-r-s); background: var(--nas-raised); cursor: pointer; }
.nas-switch input { margin-top: 2px; }
.nas-switch b { display: block; }
.nas-switch span { color: var(--nas-muted); font-size: 12.5px; }

/* cold storage card */
.nas-picks { display: flex; flex-wrap: wrap; gap: 8px; }
.nas-pick { display: inline-flex; align-items: center; gap: 7px; margin: 0; padding: 6px 12px 6px 9px; border-radius: 99px; border: 1px solid var(--nas-line);
	background: var(--nas-raised); color: var(--nas-text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; line-height: 1.3; }
.nas-pick:hover { border-color: var(--nas-btn-line); }
.nas-pick .ck { width: 15px; height: 15px; border-radius: 5px; border: 1.5px solid var(--nas-btn-line); display: inline-flex; align-items: center; justify-content: center; flex: none; }
.nas-pick.on { background: var(--nas-accent-soft); border-color: color-mix(in srgb, var(--nas-accent) 45%, transparent); color: var(--nas-accent-text); }
.nas-pick.on .ck { background: var(--nas-accent); border-color: var(--nas-accent); }
.nas-pick.on .ck::after { content: ""; width: 4px; height: 8px; border: solid var(--nas-on-accent); border-width: 0 2px 2px 0; transform: translate(0, -1px) rotate(45deg); }
.nas-pick em { font-style: normal; font-weight: 600; font-size: 11px; color: var(--nas-muted); }
.nas-pick:disabled { opacity: .55; cursor: default; }
.nas-cs-step { display: grid; grid-template-columns: 92px 1fr; gap: 12px; align-items: start; padding: 14px 0; border-top: 1px solid var(--nas-line); }
.nas-cs-step:first-of-type { border-top: 0; padding-top: 4px; }
.nas-cs-step > .nas-k { margin: 6px 0 0; }
.nas-vols { display: flex; flex-direction: column; gap: 8px; max-width: 520px; }
.nas-vol { display: flex; align-items: center; gap: 12px; margin: 0; padding: 10px 14px; border-radius: var(--nas-r-s); border: 1px solid var(--nas-line);
	background: var(--nas-raised); color: var(--nas-text); font: inherit; text-align: left; cursor: pointer; }
.nas-vol:hover { border-color: var(--nas-btn-line); }
.nas-vol b, .nas-vol .nas-small { display: block; }
.nas-vol .rd { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--nas-btn-line); flex: none; display: inline-flex; align-items: center; justify-content: center; }
.nas-vol.on { background: var(--nas-accent-soft); border-color: color-mix(in srgb, var(--nas-accent) 45%, transparent); }
.nas-vol.on .rd { border-color: var(--nas-accent); }
.nas-vol.on .rd::after { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--nas-accent); }
.nas-vol:disabled { opacity: .6; cursor: default; }
.nas-cs-stats { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 16px 24px; align-items: end; }
.nas-cs-stat:last-child { text-align: right; }
.nas-cs-speed .nas-spark { height: 34px; margin: 0 0 4px; }
.nas-cs-figs { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 10px; }
.nas-cs-figs b { font-family: var(--nas-mono); font-weight: 700; }
.nas-cs-banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--nas-r-s); background: var(--nas-raised); margin-bottom: 12px; }
.nas-bar.busy > div { width: 30% !important; animation: nas-busy 1.5s ease-in-out infinite; }
@keyframes nas-busy { from { margin-left: -30%; } to { margin-left: 100%; } }
@media (prefers-reduced-motion: reduce) { .nas-bar.busy > div { animation: none; width: 100% !important; opacity: .35; } }
.nas-dellist { max-height: 320px; overflow: auto; font-family: var(--nas-mono); font-size: 12px; line-height: 1.6; background: var(--nas-raised);
	border-radius: 10px; padding: 10px 12px; white-space: pre; margin: 10px 0; }
@media (max-width: 700px) {
	.nas-cs-step { grid-template-columns: 1fr; gap: 8px; }
	.nas-cs-step > .nas-k { margin: 0; }
	.nas-cs-stats { grid-template-columns: 1fr 1fr; }
	.nas-cs-speed { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 700px) {
	.nas-head { margin-bottom: 14px; }
	.nas-head h2 { font-size: 24px; }
	.nas-head .nas-actions { width: 100%; }
	.nas-head .nas-actions .btn { flex: 1; }
	.nas-card { padding: 16px; }
	.nas-grid, .nas-grid-2, .nas-grid-3 { gap: 10px; margin-bottom: 10px; }
	.nas-grid-4 { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
	.nas-grid-4 > :first-child, .nas-grid-4 > :last-child { grid-column: 1 / -1; }
	.nas-num { font-size: 24px; }
	.nas-hero { padding: 20px; gap: 18px; margin-bottom: 10px; }
	.nas-hero-main h1 { font-size: 30px; }
	.nas-hero-art { display: none; }
	.nas-hero .nas-actions .btn { flex: 1 1 auto; }
	.nas-hero .nas-ring { width: 168px; height: 168px; margin: 0 auto; }
	.nas-hero .nas-ring b { font-size: 30px; }
	.nas-hero .nas-ring small { max-width: 64%; font-size: 11px; line-height: 1.3; }
	.nas-chart-head { gap: 14px; }
	.nas-chart svg { height: 140px; }
	.nas-section-title { margin: 20px 0 10px; }
	/* compact list cards (shares, users): icon-only actions in the corner */
	.nas-grid > .nas-card > .nas-row:first-child { padding-right: 90px; }
	.nas-grid > .nas-card .nas-card-foot { position: absolute; top: 12px; right: 12px; margin: 0; padding: 0; border: 0; gap: 6px; }
	.nas-grid > .nas-card .nas-card-foot .btn { width: 40px; min-height: 40px; padding: 0; gap: 0; }
	.nas-grid > .nas-card .nas-card-foot .nas-btn-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.nas-grid > .nas-card .nas-card-foot .nas-ico { margin: 0; width: 18px; height: 18px; }
	.nas-avstack, .nas-chips { margin-top: 10px; }
	.nas-seg button { padding: 7px 8px; }
	.nas-access td { padding: 8px 2px; }
}
`;

/* Icon paths from Lucide (https://lucide.dev), ISC License. */
const ICONS = {
	nas: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
	drive: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
	shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
	cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
	folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
	clock: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
	user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
	users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	usb: '<circle cx="10" cy="7" r="1"/><circle cx="4" cy="20" r="1"/><path d="M4.7 19.3 19 5"/><path d="m21 3-3 1 2 2Z"/><path d="M9.26 7.68 5 12l2 5"/><path d="m10 14 5 2 3.5-3.5"/><path d="m18 12 1-1 1 1-1 1Z"/>',
	power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
	restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
	trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
	key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
	thermo: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
	fan: '<path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"/><path d="M12 12v.01"/>',
	arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
	eject: '<path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/>',
	archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>'
};

const AVATAR_COLORS = [ '#3f9f82', '#4f8fc9', '#d7744f', '#c99a2e', '#c2578a', '#6f7c8f', '#5a9e5f', '#8a7356' ];

return baseclass.extend({
	callOverview: rpc.declare({ object: 'luci.nas', method: 'overview' }),
	callStats: rpc.declare({ object: 'luci.nas', method: 'stats' }),
	callUsers: rpc.declare({ object: 'luci.nas', method: 'users_list' }),
	callUserAdd: rpc.declare({ object: 'luci.nas', method: 'user_add', params: [ 'name', 'password' ] }),
	callUserPasswd: rpc.declare({ object: 'luci.nas', method: 'user_passwd', params: [ 'name', 'password' ] }),
	callUserDel: rpc.declare({ object: 'luci.nas', method: 'user_del', params: [ 'name' ] }),
	callShares: rpc.declare({ object: 'luci.nas', method: 'shares_list' }),
	callShareSave: rpc.declare({ object: 'luci.nas', method: 'share_save',
		params: [ 'id', 'name', 'folder', 'create', 'access', 'guest', 'timemachine', 'tm_cap', 'recycle' ] }),
	callShareDelete: rpc.declare({ object: 'luci.nas', method: 'share_delete', params: [ 'id' ] }),
	callPower: rpc.declare({ object: 'luci.nas', method: 'power', params: [ 'action' ] }),
	callUsbEject: rpc.declare({ object: 'luci.nas', method: 'usb_eject', params: [ 'dev' ] }),
	callNamesSet: rpc.declare({ object: 'luci.nas', method: 'names_set', params: [ 'name', 'hostname' ] }),
	callIdlePoweroffSet: rpc.declare({ object: 'luci.nas', method: 'idle_poweroff_set', params: [ 'hours' ] }),
	callWolSet: rpc.declare({ object: 'luci.nas', method: 'wol_set', params: [ 'enabled' ] }),
	callRecycleSet: rpc.declare({ object: 'luci.nas', method: 'recycle_set', params: [ 'days', 'enabled' ] }),
	callDiskSleepSet: rpc.declare({ object: 'luci.nas', method: 'disk_sleep_set', params: [ 'minutes' ] }),
	callRecycleBins: rpc.declare({ object: 'luci.nas', method: 'recycle_bins' }),
	callRecycleEmpty: rpc.declare({ object: 'luci.nas', method: 'recycle_empty', params: [ 'id' ] }),
	callColdStatus: rpc.declare({ object: 'luci.nas', method: 'cold_status' }),
	callColdDeletes: rpc.declare({ object: 'luci.nas', method: 'cold_deletes' }),
	callColdStart: rpc.declare({ object: 'luci.nas', method: 'cold_start', params: [ 'mode', 'mount', 'folders' ] }),
	callColdConfirm: rpc.declare({ object: 'luci.nas', method: 'cold_confirm' }),
	callColdCancel: rpc.declare({ object: 'luci.nas', method: 'cold_cancel' }),

	css() {
		if (!document.getElementById('nas-css'))
			document.head.appendChild(E('style', { id: 'nas-css' }, CSS));
	},

	icon(name, cls) {
		const span = E('span', { class: cls || '' });
		span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
			'stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">' + (ICONS[name] || '') + '</svg>';
		span.style.display = 'inline-flex';
		if (!cls) { span.style.width = '100%'; span.style.height = '100%'; }
		return span;
	},

	tile(name, color) {
		return E('div', { class: 'nas-tile ' + (color || '') }, [ this.icon(name, 'nas-tile-ico') ]);
	},

	pill(text, kind) {
		return E('span', { class: 'nas-pill ' + (kind || '') }, text);
	},

	kv(label, value) {
		return E('div', { class: 'nas-kv' }, [ E('span', {}, label), E('span', {}, value) ]);
	},

	bar(pct, kind) {
		return E('div', { class: 'nas-bar ' + (kind || '') }, [ E('div', { style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' }) ]);
	},

	ring(pct, label, sub, color) {
		const r = 78, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)), off = c * (1 - p / 100);
		const gid = 'nasring' + Math.random().toString(36).slice(2, 8);
		const stroke = color || 'url(#' + gid + ')';
		const svg = '<svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="' + p + '% used">' +
			'<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--nas-accent-2)"/><stop offset="1" stop-color="var(--nas-accent)"/></linearGradient></defs>' +
			'<circle cx="100" cy="100" r="95" fill="none" stroke="color-mix(in srgb, var(--nas-text) 22%, transparent)" stroke-width="5" stroke-dasharray="1.5 8.45"/>' +
			'<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="color-mix(in srgb, var(--nas-text) 9%, transparent)" stroke-width="16"/>' +
			'<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + stroke + '" stroke-width="16" transform="rotate(-90 100 100)" ' +
			'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg>';
		const box = E('div', { class: 'nas-ring' });
		box.innerHTML = svg;
		box.appendChild(E('div', { class: 'nas-ring-label' }, [ E('b', {}, label), E('small', {}, sub) ]));
		return box;
	},

	spark(values, label) {
		const v = values.filter((x) => x != null);
		const box = E('div');
		if (v.length < 2) { box.appendChild(E('div', { class: 'nas-spark' })); return box; }
		const min = Math.min(...v) - 1, max = Math.max(...v) + 1, n = v.length;
		const pts = v.map((y, i) => [ (i / (n - 1)) * 120, 32 - ((y - min) / (max - min)) * 26 - 3 ]);
		const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
		const gid = 'nasspark' + Math.random().toString(36).slice(2, 8);
		box.innerHTML = '<svg class="nas-spark" viewBox="0 0 120 32" preserveAspectRatio="none" role="img" aria-label="' + label + '">' +
			'<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--nas-accent)" stop-opacity=".3"/><stop offset="1" stop-color="var(--nas-accent)" stop-opacity="0"/></linearGradient></defs>' +
			'<path d="' + line + ' L120 32 L0 32 Z" fill="url(#' + gid + ')"/>' +
			'<path d="' + line + '" fill="none" stroke="var(--nas-accent)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
		return box;
	},

	avatar(name, small) {
		let h = 0;
		for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
		const initials = name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';
		return E('span', { class: 'nas-avatar' + (small ? ' sm' : ''), style: 'background:' + AVATAR_COLORS[h % AVATAR_COLORS.length] }, initials);
	},

	button(label, iconName, onclick, kind) {
		const cls = {
			primary: 'btn cbi-button cbi-button-positive',
			danger: 'btn cbi-button nas-btn-danger',
			action: 'btn cbi-button cbi-button-action'
		}[kind] || 'btn cbi-button';
		return E('button', { class: cls, click: ui.createHandlerFn(this, onclick) }, [
			iconName ? this.icon(iconName, 'nas-ico') : '', E('span', { class: 'nas-btn-label' }, label)
		]);
	},

	bytes(n) {
		if (n == null) return '—';
		const u = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
		let i = 0;
		while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
		return (i ? n.toFixed(n >= 100 ? 0 : 1) : n) + ' ' + u[i];
	},

	duration(s) {
		const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
		return d ? d + 'd ' + h + 'h' : (h ? h + 'h ' + m + 'm' : m + 'm');
	},

	field(label, input, hint) {
		return E('div', { class: 'nas-field' }, [ E('label', {}, label), input, hint ? E('div', { class: 'nas-hint' }, hint) : '' ]);
	},

	notify(msg, kind) {
		ui.addNotification(null, E('p', {}, msg), kind || 'info');
	},

	confirm(title, message, okLabel, onOk, danger) {
		const err = E('div', { class: 'nas-error' });
		ui.showModal(title, [
			E('p', {}, message), err,
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					class: 'btn cbi-button ' + (danger ? 'cbi-button-negative' : 'cbi-button-positive'),
					click: ui.createHandlerFn(this, () => Promise.resolve(onOk()).then((res) => {
						if (res && res.error) err.textContent = res.error;
						else ui.hideModal();
					}))
				}, okLabel)
			])
		]);
	}
});
