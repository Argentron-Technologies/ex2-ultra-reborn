'use strict';
'require view';
'require poll';
'require ui';
'require nas.common as nas';

const FAN_LEVELS = [ '50', '60', '80', 'A0', 'C0', 'FF' ];
const HISTORY = 60;          /* samples kept for live charts */
const STATS_INTERVAL = 3;    /* seconds */

function raidStatus(r) {
	if (!r) return { text: _('Not running'), kind: 'bad', tile: 'grey' };
	const s = (r.state || '').toLowerCase();
	if (r.rebuild != null || s.indexOf('recover') >= 0 || s.indexOf('resync') >= 0)
		return { text: _('Rebuilding') + (r.rebuild != null ? ' ' + r.rebuild + '%' : ''), kind: 'info', tile: '' };
	if (s.indexOf('fail') >= 0 || r.active == 0) return { text: _('Failed'), kind: 'bad', tile: 'grey' };
	if (s.indexOf('degraded') >= 0 || r.active < r.total) return { text: _('Not protected'), kind: 'warn', tile: 'orange' };
	return { text: _('Protected'), kind: 'ok', tile: 'green' };
}

function headline(d) {
	const disks = d.disks || [], r = d.raid, st = d.storage;
	const failing = disks.some((x) => x.health && x.health != 'PASSED');

	if (!st || !st.mounted) return [ _('Storage is offline.'), _('Check the disks.') ];
	if (failing) return [ _('Needs attention.'), _('A disk is failing.') ];
	if (r && r.rebuild != null) return [ _('Rebuilding the mirror.'), r.rebuild + '% ' + _('done') ];
	if (r && r.active < r.total) return [ _('Running smoothly.'), _('One bay to fill.') ];
	return [ _('All good.'), _('Your data is mirrored.') ];
}

function rate(bps) {
	const v = bps * 8;
	if (v >= 1e9) return [ (v / 1e9).toFixed(2), 'Gb/s' ];
	if (v >= 1e6) return [ (v / 1e6).toFixed(v >= 1e8 ? 0 : 1), 'Mb/s' ];
	if (v >= 1e3) return [ (v / 1e3).toFixed(0), 'kb/s' ];
	return [ v.toFixed(0), 'b/s' ];
}

function nasArt(d) {
	const disks = d.disks || [];
	const bay = (n) => disks.find((x) => x.bay == n);
	const slot = (n, x) => {
		const disk = bay(n);
		const led = !disk ? 'var(--nas-warn)' : (disk.health && disk.health != 'PASSED' ? 'var(--nas-bad)' : 'var(--nas-ok)');
		return disk
			? '<rect x="' + x + '" y="38" width="38" height="108" rx="6" fill="url(#nasdrv)" stroke="var(--nas-accent)" stroke-width="2.5"/>' +
			  '<rect x="' + (x + 7) + '" y="50" width="24" height="3" rx="1.5" fill="var(--nas-line)"/>' +
			  '<rect x="' + (x + 7) + '" y="57" width="24" height="3" rx="1.5" fill="var(--nas-line)"/>' +
			  '<rect x="' + (x + 7) + '" y="64" width="24" height="3" rx="1.5" fill="var(--nas-line)"/>' +
			  '<circle cx="' + (x + 19) + '" cy="130" r="9" fill="' + led + '" opacity=".25"/><circle cx="' + (x + 19) + '" cy="130" r="4.5" fill="' + led + '"/>'
			: '<rect x="' + x + '" y="38" width="38" height="108" rx="6" fill="var(--nas-raised)" stroke="var(--nas-btn-line)" stroke-width="2" stroke-dasharray="5 5"/>' +
			  '<text x="' + (x + 19) + '" y="96" text-anchor="middle" fill="var(--nas-muted)" font-size="9" font-family="var(--nas-mono)">EMPTY</text>' +
			  '<circle cx="' + (x + 19) + '" cy="130" r="9" fill="' + led + '" opacity=".22"/><circle cx="' + (x + 19) + '" cy="130" r="4.5" fill="' + led + '"/>';
	};
	const box = E('div', { class: 'nas-hero-art' });
	box.innerHTML = '<svg width="150" height="168" viewBox="0 0 170 190" role="img" aria-label="' +
		_('Two-bay NAS') + '"><defs>' +
		'<linearGradient id="naschs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--nas-raised)"/><stop offset="1" stop-color="var(--nos-card, #f8f9fa)"/></linearGradient>' +
		'<linearGradient id="nasdrv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--nas-raised)"/><stop offset="1" stop-color="var(--nas-track)"/></linearGradient></defs>' +
		'<rect x="22" y="12" width="126" height="168" rx="16" fill="url(#naschs)" stroke="var(--nas-line)" stroke-width="2"/>' +
		'<rect x="30" y="20" width="110" height="2" rx="1" fill="rgba(255,255,255,.12)"/>' +
		slot(1, 44) + slot(2, 88) +
		'<circle cx="85" cy="163" r="8" fill="var(--nas-accent)" opacity=".25"/><circle cx="85" cy="163" r="4" fill="var(--nas-accent)"/></svg>';
	return box;
}

return view.extend({
	samples: [],
	socHistory: [],

	load() {
		nas.css();
		return Promise.all([ nas.callOverview(), nas.callShares().catch(() => ({ shares: [] })), nas.callStats().catch(() => null),
			nas.callColdStatus().catch(() => null) ]);
	},

	/* ------------------------------------------------------------ hero */

	renderHero(d) {
		const s = d.system, st = d.storage, h = headline(d);
		const pct = st && st.total ? Math.round(st.used / st.total * 100) : 0;
		const ringColor = pct >= 90 ? 'var(--nas-bad)' : (pct >= 80 ? 'var(--nas-warn)' : null);

		return E('section', { class: 'nas-card nas-hero' }, [
			nasArt(d),
			E('div', { class: 'nas-hero-main' }, [
				E('div', { class: 'nas-k', style: 'margin:0' }, [ (s.name || s.hostname || 'NAS') + ' · ' + (s.model || 'NAS') ]),
				E('h1', {}, [ h[0], E('br'), E('span', {}, h[1]) ]),
				E('div', { class: 'nas-chips' }, [
					E('span', { class: 'nas-chip' }, [ E('span', { class: 'nas-led ok' }), _('Online') ]),
					E('span', { class: 'nas-chip' }, [ _('Up'), ' ', E('b', {}, nas.duration(s.uptime || 0)) ]),
					E('span', { class: 'nas-chip' }, [ E('b', {}, s.ip || '—') ]),
					E('button', { class: 'nas-chip nas-chip-btn', title: _('Change name'), click: () => this.rename(s) },
						[ E('b', {}, (s.hostname || 'nas').toLowerCase() + '.local'), nas.icon('edit', 'nas-ico') ])
				]),
				E('div', { class: 'nas-actions', style: 'padding-top:4px' }, [
					E('a', { class: 'btn cbi-button cbi-button-action important', href: L.url('admin/nas/shares') }, [ nas.icon('folder', 'nas-ico'), _('Open shares') ]),
					nas.button(_('Restart'), 'restart', () => this.power('reboot')),
					nas.button(_('Shut down'), 'power', () => this.power('poweroff'), 'danger')
				])
			]),
			st && st.mounted
				? nas.ring(pct, pct + '%', nas.bytes(st.free) + ' ' + _('free of') + ' ' + nas.bytes(st.total), ringColor)
				: E('div', { class: 'nas-ring' }, [ nas.pill(_('Not mounted'), 'bad') ])
		]);
	},

	/* ------------------------------------------------------------ stat cards */

	renderStats(d) {
		const s = d.system, r = d.raid, st = raidStatus(r);
		const disks = d.disks || [];
		const bay = (n) => disks.find((x) => x.bay == n);
		const hot = disks.filter((x) => x.temp != null).map((x) => x.temp);
		const diskTemp = hot.length ? Math.max(...hot) : null;
		const lvl = FAN_LEVELS.indexOf(String(s.fan_level || '').toUpperCase()) + 1;

		const bayBox = (n) => {
			const dk = bay(n);
			if (!dk) return E('div', { class: 'empty' }, _('Bay') + ' ' + n + ' · ' + _('empty'));
			const bad = dk.health && dk.health != 'PASSED';
			return E('div', { class: bad ? 'bad' : '' }, _('Bay') + ' ' + n + ' · ' + (bad ? _('failing') : _('OK')));
		};

		return E('div', { class: 'nas-grid-4' }, [
			E('section', { class: 'nas-card' }, [
				E('div', { class: 'nas-k' }, _('Protection')),
				E('div', { class: 'nas-row', style: 'gap:10px' }, [
					E('span', { class: 'nas-led ' + (st.kind == 'info' ? 'ok' : st.kind) }),
					E('span', { style: 'font-size:20px;font-weight:650' }, r ? r.active + ' ' + _('of') + ' ' + r.total + ' ' + _('disks') : _('No RAID'))
				]),
				E('div', { class: 'nas-baypair', style: 'margin-top:12px' }, [ bayBox(1), bayBox(2) ]),
				r && r.rebuild != null ? E('div', { style: 'margin-top:12px' }, [
					E('div', { class: 'nas-row', style: 'justify-content:space-between' }, [
						E('span', { style: 'font-weight:600' }, _('Rebuilding mirror')),
						E('span', { class: 'nas-num', style: 'font-size:15px' }, r.rebuild + '%')
					]),
					nas.bar(r.rebuild, ''),
					E('div', { class: 'nas-muted nas-small' }, r.finish_min != null
						? _('About') + ' ' + nas.duration(Math.round(r.finish_min * 60)) + ' ' + _('left') + ' · ' + _('the NAS stays usable')
						: _('The NAS stays usable while it rebuilds'))
				]) : ''
			]),
			E('section', { class: 'nas-card' }, [
				E('div', { class: 'nas-card-head', style: 'margin:0' }, [ E('div', { class: 'nas-k', style: 'margin:0' }, _('Processor')), E('span', { class: 'nas-muted nas-small' }, _('live')) ]),
				E('div', { class: 'nas-num', id: 'nas-soc' }, s.soc_temp != null ? [ Math.round(s.soc_temp), E('small', {}, '°C') ] : '—'),
				E('div', { id: 'nas-soc-spark' }, nas.spark(this.socHistory, _('Processor temperature, recent')))
			]),
			E('section', { class: 'nas-card' }, [
				E('div', { class: 'nas-k' }, _('Disk')),
				E('div', { class: 'nas-num' }, diskTemp != null ? [ Math.round(diskTemp), E('small', {}, '°C') ] : '—'),
				nas.bar(diskTemp != null ? diskTemp / 60 * 100 : 0, diskTemp >= 55 ? 'bad' : (diskTemp >= 46 ? 'warn' : '')),
				E('div', { class: 'nas-small ' + (diskTemp >= 46 ? '' : 'nas-muted') }, diskTemp == null ? _('Asleep') : (diskTemp >= 55 ? _('Too hot') : (diskTemp >= 46 ? _('Warm') : _('Normal'))))
			]),
			E('section', { class: 'nas-card' }, [
				E('div', { class: 'nas-card-head', style: 'margin:0' }, [
					E('div', { class: 'nas-k', style: 'margin:0' }, _('Fan')),
					s.board_temp != null ? E('span', {
						class: 'nas-small', title: _('Board temperature. Like WD: the fan speeds up above 64 °C and runs at full speed above 73 °C.'),
						style: 'font-weight:600;color:' + (s.board_temp > 73 ? 'var(--nas-bad)' : (s.board_temp > 64 ? 'var(--nas-warn)' : 'var(--nas-muted)'))
					}, _('Board') + ' ' + s.board_temp + ' °C') : ''
				]),
				E('div', { class: 'nas-num' }, s.fan_rpm ? [ s.fan_rpm, E('small', {}, ' rpm') ] : '—'),
				E('div', { class: 'nas-meter', 'aria-hidden': 'true' }, FAN_LEVELS.map((_l, i) =>
					E('span', { class: i < lvl ? 'on' : '', style: 'height:' + (30 + i * 14) + '%' }))),
				E('div', { class: 'nas-small', style: 'color:var(--nas-ok);font-weight:600' },
					lvl ? (lvl <= 2 ? _('Quiet') : (lvl <= 4 ? _('Moderate') : _('Loud'))) + ' · ' + _('level') + ' ' + lvl + ' ' + _('of') + ' 6' : _('Automatic'))
			])
		]);
	},

	/* ------------------------------------------------------------ network chart */

	renderChartCard() {
		this.chart = {
			now: E('div', { class: 'nas-num', style: 'font-size:24px' }, '—'),
			nowOut: E('div', { class: 'nas-num', style: 'font-size:24px' }, '—'),
			peak: E('div', { class: 'nas-num', style: 'font-size:24px' }, '—'),
			plot: E('div', { class: 'nas-chart' }),
			tip: E('div', { class: 'nas-tip' }),
			link: E('span')
		};
		this.chart.plot.appendChild(this.chart.tip);
		const svgHost = E('div');
		this.chart.svgHost = svgHost;
		this.chart.labels = E('div');
		this.chart.plot.insertBefore(svgHost, this.chart.tip);
		this.chart.plot.insertBefore(this.chart.labels, this.chart.tip);

		this.chart.plot.addEventListener('mousemove', (ev) => this.chartHover(ev));
		this.chart.plot.addEventListener('mouseleave', () => { this.chart.tip.style.display = 'none'; this.drawChart(); });

		const stat = (label, el) => E('div', {}, [ E('div', { class: 'nas-k', style: 'margin:0 0 2px' }, label), el ]);

		return E('section', { class: 'nas-card', style: 'margin-bottom:16px' }, [
			E('div', { class: 'nas-chart-head' }, [
				E('div', {}, [
					E('div', { class: 'nas-row', style: 'gap:10px' }, [ E('h3', { style: 'margin:0' }, _('Network')), this.chart.link ]),
					E('div', { class: 'nas-row', style: 'gap:14px;margin-top:6px' }, [
						E('span', { class: 'nas-legend' }, [ E('i'), _('In') ]),
						E('span', { class: 'nas-legend' }, [ E('i', { class: 'alt' }), _('Out') ]),
						E('span', { class: 'nas-muted nas-small' }, _('last 3 minutes, live'))
					])
				]),
				E('div', { style: 'flex:1' }),
				stat(_('In now'), this.chart.now),
				stat(_('Out now'), this.chart.nowOut),
				stat(_('Peak'), this.chart.peak)
			]),
			this.chart.plot,
			E('div', { class: 'nas-axis' }, [ E('span', {}, _('3 min ago')), E('span', {}, _('now')) ])
		]);
	},

	pushStats(st) {
		if (!st) return;
		const last = this.lastStats;
		this.lastStats = st;
		if (st.soc_temp != null) {
			this.socHistory.push(st.soc_temp);
			if (this.socHistory.length > HISTORY) this.socHistory.shift();
		}
		if (!last || st.t <= last.t) return;
		const dt = st.t - last.t;
		this.samples.push({ rx: Math.max(0, (st.rx - last.rx) / dt), tx: Math.max(0, (st.tx - last.tx) / dt), at: Date.now() });
		if (this.samples.length > HISTORY) this.samples.shift();
	},

	drawChart(hoverIdx) {
		const c = this.chart, S = this.samples;
		if (!c) return;
		const W = 600, H = 170, top = 18, base = 150;
		const max = Math.max(1, ...S.map((x) => Math.max(x.rx, x.tx))) * 1.15;
		const x = (i) => S.length < 2 ? W : (i + (HISTORY - S.length)) / (HISTORY - 1) * (W - 8);
		const y = (v) => base - v / max * (base - top);
		const path = (k) => S.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[k]).toFixed(1)).join(' ');
		const gid = 'nasarea';
		const ticks = [ 0.5, 1 ].map((f) => max / 1.15 * f);
		const grid = ticks.map((v) => '<line x1="0" x2="' + W + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--nas-line)" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>').join('');
		c.labels.replaceChildren(...ticks.map((v) => { const r = rate(v); return E('span', { class: 'nas-ylab', style: 'top:' + (y(v) / H * 100).toFixed(2) + '%' }, r[0] + ' ' + r[1]); }));

		let body = '<line x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '" stroke="var(--nas-line)" vector-effect="non-scaling-stroke"/>' + grid;
		if (S.length >= 2) {
			const last = S.length - 1;
			body += '<path d="' + path('rx') + ' L' + x(last).toFixed(1) + ' ' + base + ' L' + x(0).toFixed(1) + ' ' + base + ' Z" fill="url(#' + gid + ')"/>' +
				'<path d="' + path('tx') + '" fill="none" stroke="var(--nas-muted)" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
				'<path d="' + path('rx') + '" fill="none" stroke="var(--nas-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
			const hi = hoverIdx != null ? hoverIdx : last;
			body += '<line x1="' + x(hi).toFixed(1) + '" x2="' + x(hi).toFixed(1) + '" y1="' + top + '" y2="' + base + '" stroke="var(--nas-muted)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>';
			c.labels.append(
				E('span', { class: 'nas-dot', style: 'left:' + (x(hi) / W * 100).toFixed(2) + '%;top:' + (y(S[hi].rx) / H * 100).toFixed(2) + '%' }),
				E('span', { class: 'nas-dot alt', style: 'left:' + (x(hi) / W * 100).toFixed(2) + '%;top:' + (y(S[hi].tx) / H * 100).toFixed(2) + '%' }));
		} else {
			c.labels.append(E('span', { class: 'nas-ylab', style: 'top:50%;left:50%;transform:translate(-50%,-50%);font-family:inherit' }, _('Collecting data…')));
		}

		c.svgHost.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + _('Network traffic over the last 3 minutes') + '">' +
			'<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--nas-accent)" stop-opacity=".3"/><stop offset="1" stop-color="var(--nas-accent)" stop-opacity="0"/></linearGradient></defs>' +
			body + '</svg>';

		if (S.length) {
			const cur = S[S.length - 1], r1 = rate(cur.rx), r2 = rate(cur.tx);
			const pk = rate(Math.max(...S.map((p) => Math.max(p.rx, p.tx))));
			c.now.replaceChildren(r1[0], E('small', {}, ' ' + r1[1]));
			c.nowOut.replaceChildren(r2[0], E('small', {}, ' ' + r2[1]));
			c.peak.replaceChildren(pk[0], E('small', {}, ' ' + pk[1]));
		}
	},

	chartHover(ev) {
		const S = this.samples, c = this.chart;
		if (S.length < 2) return;
		const box = c.plot.getBoundingClientRect();
		const fx = (ev.clientX - box.left) / box.width;
		const slot = Math.round(fx * (HISTORY - 1)) - (HISTORY - S.length);
		const i = Math.max(0, Math.min(S.length - 1, slot));
		this.drawChart(i);
		const p = S[i], a = rate(p.rx), b = rate(p.tx);
		const ago = Math.round((Date.now() - p.at) / 1000);
		c.tip.replaceChildren(
			E('div', { class: 'nas-muted' }, ago <= 1 ? _('now') : ago + ' s ' + _('ago')),
			E('div', {}, [ _('In'), ' ', E('b', {}, a[0] + ' ' + a[1]) ]),
			E('div', {}, [ _('Out'), ' ', E('b', {}, b[0] + ' ' + b[1]) ]));
		c.tip.style.display = 'block';
		const left = ((i + (HISTORY - S.length)) / (HISTORY - 1)) * box.width;
		c.tip.style.left = Math.max(60, Math.min(box.width - 60, left)) + 'px';
	},

	/* ------------------------------------------------------------ bays, shares, services */

	renderBay(n, disk, raid) {
		if (!disk)
			return E('div', { class: 'nas-card nas-bay empty' }, [
				E('span', { class: 'nas-bay-label' }, _('Bay') + ' ' + n),
				nas.tile('drive', 'grey'), E('b', { style: 'color:var(--nas-text)' }, _('Empty')),
				E('span', { class: 'nas-small' }, _('Insert a disk to mirror your data'))
			]);

		const inRaid = raid && raid.members.some((m) => m.dev.indexOf(disk.dev) == 0);
		const sleeping = disk.state == 'standby';
		const health = disk.health == 'PASSED' ? nas.pill(_('Healthy'), 'ok')
			: (disk.health ? nas.pill(_('Failing'), 'bad') : nas.pill(sleeping ? _('Asleep') : _('Unknown'), ''));
		const years = disk.hours != null ? (disk.hours / 8766).toFixed(1) + ' ' + _('years') : '—';

		return E('div', { class: 'nas-card nas-bay' }, [
			E('span', { class: 'nas-bay-label' }, _('Bay') + ' ' + n),
			E('div', { class: 'nas-row', style: 'margin-bottom:10px;padding-right:48px' }, [
				nas.tile('drive', sleeping ? 'grey' : ''),
				E('div', { class: 'nas-grow' }, [
					E('div', { class: 'nas-name nas-ellipsis' }, nas.bytes(disk.size) + ' · ' + (disk.model || disk.dev)),
					E('div', { class: 'nas-row', style: 'gap:6px;margin-top:6px' }, [ health,
						nas.pill(sleeping ? _('Sleeping') : _('Spinning'), sleeping ? '' : 'info') ])
				])
			]),
			nas.kv(_('Temperature'), disk.temp != null ? Math.round(disk.temp) + ' °C' : (sleeping ? _('asleep') : '—')),
			nas.kv(_('In mirror'), inRaid ? _('Yes') : _('No')),
			nas.kv(_('Running time'), years),
			nas.kv(_('Serial'), E('span', { style: 'font-family:var(--nas-mono);font-size:12.5px' }, disk.serial || '—'))
		]);
	},

	renderShares(shares) {
		const list = (shares || []).slice().sort((a, b) => (b.timemachine - a.timemachine) || a.name.localeCompare(b.name));
		const rows = list.slice(0, 5).map((sh) => {
			const users = Object.keys(sh.access || {}).length;
			const desc = sh.timemachine ? _('Mac backups') + (sh.tm_cap ? ' · ' + sh.tm_cap + ' GB ' + _('cap') : '')
				: (sh.guest ? _('Guest access') : users + ' ' + (users == 1 ? _('user') : _('users')));
			return E('div', { class: 'nas-list-row' }, [
				E('div', { class: 'nas-row' }, [
					nas.tile(sh.timemachine ? 'clock' : 'folder'),
					E('div', { class: 'nas-grow' }, [ E('div', { style: 'font-weight:600' }, sh.name), E('div', { class: 'nas-muted nas-small' }, desc) ])
				])
			]);
		});

		return E('section', { class: 'nas-card' }, [
			E('div', { class: 'nas-card-head' }, [
				E('h3', {}, _('Shares')),
				E('a', { href: L.url('admin/nas/shares') }, list.length > 5 ? _('All %d shares').format(list.length) : _('Manage'))
			]),
			rows.length ? E('div', {}, rows) : E('div', { class: 'nas-muted', style: 'padding:12px 0' }, _('No shares yet'))
		]);
	},

	renderServices(d) {
		const label = { running: _('Running'), auto: _('Automatic'), idle: _('On'), off: _('Off'), stopped: _('Stopped') };
		const kind = { running: 'ok', auto: 'ok', idle: 'ok', off: 'off', stopped: 'bad' };
		return E('section', { class: 'nas-card' }, [
			E('div', { class: 'nas-card-head' }, [ E('h3', {}, _('Services')) ]),
			E('div', {}, (d.services || []).map((s) => E('div', { class: 'nas-list-row' }, [
				E('span', {}, _(s.name)),
				E('span', { class: 'nas-state ' + kind[s.state] }, [
					E('span', { class: 'nas-led ' + kind[s.state] }),
					s.detail ? _('After') + ' ' + s.detail : label[s.state]
				])
			])))
		]);
	},

	renderUsb(d) {
		const drives = d.usb || [];
		const host = (d.system.hostname || 'nas').toLowerCase();
		const fsName = { vfat: 'FAT32', exfat: 'exFAT', ntfs: 'NTFS', ext2: 'ext2', ext3: 'ext3', ext4: 'ext4', hfsplus: 'Mac (HFS+)', apfs: 'Mac (APFS)' };

		const partRow = (p) => {
			const fs = fsName[p.fstype] || p.fstype || _('unknown format');
			const title = p.label || p.share || p.dev;
			if (!p.mount) {
				const why = (p.state || '').indexOf('unsupported') == 0
					? _('%s is not supported. Use exFAT to share it with Mac and Windows.').format(fs)
					: _('Could not be opened (%s).').format(fs);
				return E('div', { class: 'nas-usb-part' }, [
					E('div', { class: 'nas-row', style: 'justify-content:space-between' }, [ E('b', {}, title), nas.pill(_('Not shared'), 'warn') ]),
					E('div', { class: 'nas-muted nas-small' }, why)
				]);
			}
			const pct = p.total ? Math.round(p.used / p.total * 100) : 0;
			return E('div', { class: 'nas-usb-part' }, [
				E('div', { class: 'nas-row', style: 'justify-content:space-between' }, [
					E('b', { class: 'nas-ellipsis' }, title),
					p.readonly ? nas.pill(_('Read-only'), 'warn') : nas.pill(_('Shared'), 'ok')
				]),
				nas.bar(pct, pct >= 90 ? 'bad' : (pct >= 80 ? 'warn' : '')),
				E('div', { class: 'nas-muted nas-small' }, nas.bytes(p.free) + ' ' + _('free of') + ' ' + nas.bytes(p.total) + ' · ' + fs),
				p.share ? E('div', { class: 'nas-small', style: 'margin-top:4px;font-family:var(--nas-mono)' }, 'smb://' + host + '.local/' + p.share) : '',
				p.readonly ? E('div', { class: 'nas-muted nas-small' }, _('It was unplugged without ejecting. Check it on a computer to make it writable again.')) : ''
			]);
		};

		/* link speed as the kernel reports it, and whether a USB 3 drive fell back to USB 2 */
		const linkText = (u) => {
			const m = u.link_mbps;
			if (!m) return '';
			const gen = m >= 5000 ? 'USB 3' : (m >= 480 ? 'USB 2' : 'USB 1');
			return gen + ' · ' + (m >= 1000 ? (m / 1000) + ' Gb/s' : m + ' Mb/s');
		};
		const slowLink = (u) => u.link_mbps && u.link_mbps < 5000 && u.usb_version >= 3;

		return E('div', {}, [
			E('div', { class: 'nas-section-title' }, _('USB drives')),
			drives.length ? E('div', { class: 'nas-grid-2' }, drives.map((u) => E('div', { class: 'nas-card' }, [
				E('div', { class: 'nas-row', style: 'margin-bottom:10px' }, [
					nas.tile('usb'),
					E('div', { class: 'nas-grow' }, [
						E('div', { class: 'nas-name nas-ellipsis' }, u.model || u.dev),
						E('div', { class: 'nas-muted nas-small' }, nas.bytes(u.size) + (linkText(u) ? ' · ' + linkText(u) : ''))
					]),
					nas.button(_('Eject'), 'eject', () => this.eject(u))
				]),
				slowLink(u) ? E('div', { class: 'nas-row', style: 'gap:8px;margin-bottom:10px' }, [
					nas.pill(_('Slow link'), 'warn'),
					E('div', { class: 'nas-muted nas-small' }, _('This USB 3 drive is running at USB 2 speed. Eject it, then push it back in firmly.'))
				]) : '',
				...(u.parts.length ? u.parts.map(partRow)
					: [ E('div', { class: 'nas-muted nas-small' }, _('No readable partitions. Format it as exFAT on a computer to use it here.')) ])
			]))) : E('div', { class: 'nas-card nas-row', style: 'gap:14px' }, [
				nas.tile('usb', 'grey'),
				E('div', {}, [
					E('b', {}, _('No USB drive connected')),
					E('div', { class: 'nas-muted nas-small' }, _('Plug one into the back of the NAS and it is shared on the network automatically.'))
				])
			])
		]);
	},

	/* ------------------------------------------------------------ cold storage */

	/* The card keeps its own state (this.cs) and its own poll, so the 15 s
	 * overview refresh never resets the folders you are ticking. */

	coldInit(cs) {
		const last = cs && cs.last;
		this.cs = {
			data: cs,
			mode: (last && last.mode == 'sync') ? 'sync' : 'copy',
			mount: null,
			folders: new Set(last ? last.folders.filter((f) => (cs.folders || []).indexOf(f) >= 0) : []),
			lastFetch: 0
		};
	},

	coldRender() {
		if (!this.coldEl || !this.cs) return;
		this.coldEl.replaceChildren(E('div', { class: 'nas-section-title' }, _('Cold storage')), this.renderCold(this.cs.data));
	},

	coldRefresh(force) {
		const job = this.cs?.data?.job;
		const busy = job && (job.running || job.phase == 'confirm');
		const now = Date.now();
		if (!force && !busy && now - this.cs.lastFetch < 10000) return Promise.resolve();
		this.cs.lastFetch = now;
		return nas.callColdStatus().then((d) => {
			const was = this.cs.data?.job;
			this.cs.data = d;
			this.coldSpeed(d.job);
			/* a job just finished: let the USB card show the new free space */
			if (was && was.running && !(d.job && d.job.running)) this.refresh();
			this.coldRender();
		}).catch(() => {});
	},

	/* live speed: bytes copied between 2 s polls, averaged over ~6 s; history for the chart */
	coldSpeed(j) {
		const cs = this.cs;
		if (!j || j.phase != 'copying' || j.bytes == null || !j.running) return;
		if (cs.speedKey !== j.started) { cs.speedKey = j.started; cs.samples = []; cs.speeds = []; cs.speedNow = null; }
		const S = cs.samples;
		if (S.length && S[S.length - 1].t == j.now) return;
		S.push({ t: j.now, b: j.bytes });
		while (S.length > 2 && j.now - S[0].t > 6) S.shift();
		const a = S[0], z = S[S.length - 1];
		if (z.t - a.t >= 3) {
			cs.speedNow = Math.max(0, (z.b - a.b) / (z.t - a.t));
			cs.speeds.push(cs.speedNow);
			if (cs.speeds.length > 60) cs.speeds.shift();   /* about 2 minutes */
		}
	},

	renderCold(d) {
		const job = d && d.job;
		const head = (sub, right) => E('div', { class: 'nas-row', style: 'margin-bottom:14px' }, [
			nas.tile('archive'),
			E('div', { class: 'nas-grow' }, [ E('div', { class: 'nas-name' }, _('Copy to a USB drive')), E('div', { class: 'nas-muted nas-small' }, sub) ]),
			right || ''
		]);

		if (!d) return E('section', { class: 'nas-card' }, [ head(_('Status unavailable')) ]);

		if (job && (job.running || job.phase == 'confirm'))
			return E('section', { class: 'nas-card' }, [
				head((job.mode == 'sync' ? _('Syncing to') : _('Copying to')) + ' ' + job.label + '/NAS-Backup',
					nas.pill(job.mode == 'sync' ? _('Sync') : _('Copy'), 'info')),
				job.phase == 'confirm' ? this.renderColdConfirm(job) : this.renderColdProgress(job)
			]);

		return E('section', { class: 'nas-card' }, [
			head(_('A copy of your folders that stays safe when the drive is unplugged')),
			this.renderColdResult(job, d.last),
			this.renderColdForm(d)
		]);
	},

	renderColdProgress(job) {
		const fmt = (n) => (n || 0).toLocaleString();
		const elapsed = job.now - (job.started || job.now);
		const stop = nas.button(_('Cancel'), 'stop', () => this.coldCancel(job), 'danger');
		const figs = (items) => E('div', { class: 'nas-cs-figs nas-small' }, items.map((i) => E('span', {}, [ E('span', { class: 'nas-muted' }, i[0] + ' '), E('b', {}, i[1]) ])));

		const copying = job.phase == 'copying' && job.bytes != null;
		if (!copying) {
			const scanning = job.phase == 'checking';
			return E('div', {}, [
				E('div', { class: 'nas-row', style: 'justify-content:space-between' }, [
					E('b', {}, scanning ? _('Checking what needs copying…') : _('Preparing…')),
					E('span', { class: 'nas-muted nas-small' }, nas.duration(elapsed))
				]),
				nas.bar(100, 'busy'),
				E('div', { class: 'nas-muted nas-small' }, job.scanned
					? _('%s files looked at').format(fmt(job.scanned))
					: _('Reading the folder list. Large folders take a few minutes.')),
				E('div', { class: 'nas-card-foot' }, [ stop ])
			]);
		}

		const plan = job.plan_bytes || 0;
		const pct = plan > 0 ? Math.min(99, Math.floor(job.bytes / plan * 100)) : 99;
		const left = job.rate > 0 && plan > job.bytes ? Math.round((plan - job.bytes) / job.rate) : null;
		const cs = this.cs;
		const live = cs.speedKey === job.started && cs.speedNow != null ? cs.speedNow : job.rate;
		const copyTime = job.now - (job.copy_since || job.started || job.now);
		const avg = copyTime > 0 ? job.bytes / copyTime : null;
		const speedTxt = (v) => {
			if (v == null) return [ '—' ];
			const t = nas.bytes(v).split(' ');
			return [ t[0], E('small', {}, ' ' + t[1] + '/s') ];
		};
		const stat = (label, big, sub) => E('div', { class: 'nas-cs-stat' }, [
			E('div', { class: 'nas-k', style: 'margin:0 0 2px' }, label), E('div', { class: 'nas-num' }, big), sub || '' ]);
		return E('div', {}, [
			E('div', { class: 'nas-cs-stats' }, [
				stat(_('Done'), [ pct, E('small', {}, '%') ],
					E('div', { class: 'nas-muted nas-small' }, nas.bytes(job.bytes) + ' ' + _('of') + ' ' + nas.bytes(plan))),
				E('div', { class: 'nas-cs-stat nas-cs-speed' }, [
					E('div', { class: 'nas-k', style: 'margin:0 0 2px' }, _('Speed')),
					E('div', { class: 'nas-row', style: 'gap:14px;align-items:flex-end' }, [
						E('div', { class: 'nas-num' }, speedTxt(live)),
						E('div', { class: 'nas-grow', style: 'max-width:180px' },
							nas.spark((cs.speedKey === job.started && cs.speeds) || [], _('Transfer speed, last 2 minutes')))
					]),
					E('div', { class: 'nas-muted nas-small' }, avg ? _('Average') + ' ' + nas.bytes(avg) + '/s' : '')
				]),
				stat(_('Time left'), left != null ? nas.duration(Math.max(60, left)) : _('Finishing…'),
					E('div', { class: 'nas-muted nas-small' }, _('Running') + ' ' + nas.duration(elapsed)))
			]),
			nas.bar(pct, ''),
			figs([
				[ _('Files'), fmt(job.files) + ' / ' + fmt(job.plan_files) ]
			]),
			E('div', { class: 'nas-muted nas-small', style: 'margin-top:10px' },
				_('You can close this page: the copy keeps running on the NAS, and you get an e-mail when it is done.')),
			E('div', { class: 'nas-card-foot' }, [ stop ])
		]);
	},

	renderColdConfirm(job) {
		return E('div', {}, [
			E('div', { class: 'nas-cs-banner' }, [
				nas.pill(_('Waiting for you'), 'warn'),
				E('div', {}, [
					E('b', {}, _('Sync will delete %s from the drive.').format(job.plan_deletes == 1 ? _('1 item') : _('%s items').format(job.plan_deletes.toLocaleString()))),
					E('div', { class: 'nas-muted nas-small' }, _('They were deleted or moved on the NAS. It will also copy %s of new and changed files.').format(nas.bytes(job.plan_bytes)))
				])
			]),
			E('div', { class: 'nas-card-foot' }, [
				nas.button(_('Cancel sync'), null, () => this.coldCancel(job)),
				nas.button(_('Review and continue'), 'arrow', () => this.coldReview(job), 'primary')
			])
		]);
	},

	renderColdResult(job, last) {
		const ended = job && [ 'done', 'warn', 'failed', 'cancelled' ].indexOf(job.phase) >= 0;
		const r = ended ? { result: job.phase, message: job.message, finished: job.finished || job.now, label: job.label, mode: job.mode }
			: (last ? { result: last.result, message: last.message, finished: last.finished, label: last.drive, mode: last.mode,
				copied: last.copied, files: last.files, deleted: last.deleted } : null);
		if (!r) return '';
		const kinds = { done: [ _('Finished'), 'ok' ], warn: [ _('Finished with problems'), 'warn' ], failed: [ _('Failed'), 'bad' ], cancelled: [ _('Cancelled'), '' ] };
		const k = kinds[r.result] || [ r.result, '' ];
		const ago = Math.max(0, Math.round(Date.now() / 1000 - r.finished));
		const when = ago < 120 ? _('just now') : nas.duration(ago) + ' ' + _('ago');
		const l = last && last.finished == r.finished ? last : null;
		let summary = (r.mode == 'sync' ? _('Sync') : _('Copy')) + ' ' + _('to') + ' ' + r.label + ' · ' + when;
		if (l && r.result != 'cancelled')
			summary += ' · ' + _('%s files, %s').format(l.files.toLocaleString(), nas.bytes(l.copied)) + (r.mode == 'sync' ? ' · ' + _('%s deleted').format(l.deleted.toLocaleString()) : '');
		return E('div', { class: 'nas-cs-banner' }, [
			nas.pill(k[0], k[1]),
			E('div', { class: 'nas-grow' }, [
				E('div', { class: 'nas-small' }, summary),
				r.message ? E('div', { class: 'nas-muted nas-small' }, r.message) : ''
			])
		]);
	},

	renderColdForm(d) {
		const cs = this.cs;
		const fsName = { vfat: 'FAT32', exfat: 'exFAT', ntfs3: 'NTFS', ntfs: 'NTFS', ext2: 'ext2', ext3: 'ext3', ext4: 'ext4' };
		const targets = (d.targets || []).filter((t) => !t.readonly);
		if (!targets.find((t) => t.mount == cs.mount)) cs.mount = targets.length ? targets[0].mount : null;
		const t = targets.find((x) => x.mount == cs.mount);
		const step = (label, body) => E('div', { class: 'nas-cs-step' }, [ E('div', { class: 'nas-k' }, label), E('div', {}, body) ]);
		const redraw = () => this.coldRender();

		if (!targets.length)
			return E('div', { class: 'nas-cs-banner', style: 'margin:0' }, [
				E('div', {}, [
					E('b', {}, (d.targets || []).length ? _('The USB drive is read-only') : _('Plug in your cold storage drive')),
					E('div', { class: 'nas-muted nas-small' }, (d.targets || []).length
						? _('It was unplugged without ejecting. Check it on a computer, then plug it in again.')
						: _('Use a USB port on the back of the NAS. exFAT works with Mac and Windows.'))
				])
			]);

		const seg = (items, cur, set) => E('div', { class: 'nas-seg' }, items.map((i) =>
			E('button', { class: cur == i[0] ? 'on' : '', type: 'button', click: () => { set(i[0]); redraw(); } }, i[1])));

		const fat = t && t.fstype == 'vfat';

		const all = d.folders || [];
		const picks = all.map((f) => E('button', {
			class: 'nas-pick' + (cs.folders.has(f) ? ' on' : ''), type: 'button',
			title: f == 'TimeMachineBackup' ? _('Mac backups: large, and already a copy of your Mac') : '',
			click: () => { cs.folders.has(f) ? cs.folders.delete(f) : cs.folders.add(f); redraw(); }
		}, [ E('span', { class: 'ck' }), f, f == 'TimeMachineBackup' ? E('em', {}, _('large')) : '' ]));

		const n = cs.folders.size;
		return E('div', {}, [
			step(_('Drive'), [
				E('div', { class: 'nas-vols', role: 'radiogroup', 'aria-label': _('Drive') }, (d.targets || []).map((x) => {
					const on = x.mount == cs.mount;
					return E('button', {
						class: 'nas-vol' + (on ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
						disabled: x.readonly ? '' : null,
						click: () => { cs.mount = x.mount; redraw(); }
					}, [
						E('span', { class: 'rd' }),
						E('span', { class: 'nas-grow' }, [
							E('b', {}, x.label),
							E('span', { class: 'nas-muted nas-small' }, x.readonly
								? _('Read-only: it was unplugged without ejecting. Check it on a computer.')
								: nas.bytes(x.free) + ' ' + _('free of') + ' ' + nas.bytes(x.total) + ' · ' + (fsName[x.fstype] || x.fstype) +
									(x.has_backup ? ' · ' + _('has an earlier backup') : ''))
						])
					]);
				})),
				fat ? E('div', { class: 'nas-small', style: 'margin-top:4px;color:var(--nas-warn)' }, _('FAT32 cannot hold files larger than 4 GB; those will be skipped. exFAT has no such limit.')) : ''
			]),
			step(_('Mode'), [
				seg([ [ 'copy', _('Copy') ], [ 'sync', _('Sync') ] ], cs.mode, (v) => { cs.mode = v; }),
				E('div', { class: 'nas-muted nas-small', style: 'margin-top:6px' }, cs.mode == 'copy'
					? _('Adds new and changed files. Never deletes anything on the drive, so files you delete by mistake on the NAS stay safe there.')
					: _('Makes the drive match the NAS: files you deleted on the NAS are deleted from the drive too. You see the list and confirm before anything is deleted.'))
			]),
			step(_('Folders'), [
				E('div', { class: 'nas-picks' }, picks),
				E('div', { class: 'nas-small', style: 'margin-top:8px' }, [
					E('a', { href: '#', click: (ev) => { ev.preventDefault(); all.forEach((f) => { if (f != 'TimeMachineBackup') cs.folders.add(f); }); redraw(); } }, _('Select all')),
					' · ',
					E('a', { href: '#', click: (ev) => { ev.preventDefault(); cs.folders.clear(); redraw(); } }, _('Clear'))
				])
			]),
			E('div', { class: 'nas-card-foot', style: 'justify-content:space-between;align-items:center' }, [
				E('span', { class: 'nas-muted nas-small' }, t ? _('Saved in %s').format(t.label + '/NAS-Backup') : ''),
				E('button', {
					class: 'btn cbi-button cbi-button-positive', disabled: n ? null : '',
					click: ui.createHandlerFn(this, () => this.coldStart())
				}, [ nas.icon('play', 'nas-ico'), E('span', { class: 'nas-btn-label' },
					n ? (cs.mode == 'sync' ? (n == 1 ? _('Sync 1 folder') : _('Sync %d folders').format(n))
						: (n == 1 ? _('Copy 1 folder') : _('Copy %d folders').format(n))) : _('Choose folders')) ])
			])
		]);
	},

	coldStart() {
		const cs = this.cs;
		const order = (this.cs.data.folders || []).filter((f) => cs.folders.has(f));
		return nas.callColdStart(cs.mode, cs.mount, order).then((res) => {
			if (res && res.error) { nas.notify(res.error, 'error'); return; }
			cs.lastFetch = 0;
			return new Promise((ok) => setTimeout(ok, 800)).then(() => this.coldRefresh(true));
		});
	},

	coldCancel(job) {
		const waiting = job.phase == 'confirm';
		if (waiting)
			return nas.callColdCancel().then(() => this.coldRefresh(true));
		nas.confirm(_('Cancel the copy?'), _('What is already copied stays on the drive. Starting again later continues where it stopped.'),
			_('Cancel copy'), () => nas.callColdCancel().then(() => this.coldRefresh(true)), true);
	},

	coldReview(job) {
		return nas.callColdDeletes().then((r) => {
			const more = r.count - r.list.length;
			ui.showModal(_('Delete from %s?').format(job.label), [
				E('p', {}, _('These were deleted or moved on the NAS, so Sync removes them from %s. Nothing on the NAS is touched.').format(job.label + '/NAS-Backup')),
				E('div', { class: 'nas', style: 'margin:0' }, [   /* .nas: the theme variables live there; modals sit outside the page */
					E('div', { class: 'nas-dellist' }, r.list.join('\n') + (more > 0 ? '\n' + _('…and %s more').format(more.toLocaleString()) : ''))
				]),
				E('p', { class: 'nas-muted nas-small' }, _('Want to keep them? Choose Cancel sync, then use Copy instead: it never deletes.')),
				E('div', { class: 'right' }, [
					E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Back')), ' ',
					E('button', { class: 'btn cbi-button cbi-button-negative', click: ui.createHandlerFn(this, () =>
						nas.callColdConfirm().then((res) => {
							if (res && res.error) { nas.notify(res.error, 'error'); return; }
							ui.hideModal();
							return this.coldRefresh(true);
						})) }, _('Delete %s and sync').format(r.count.toLocaleString()))
				])
			]);
		});
	},

	eject(u) {
		const shares = u.parts.filter((p) => p.share).map((p) => p.share);
		nas.confirm(_('Eject %s?').format(u.model || u.dev),
			(shares.length ? _('The %s share stops. ').format(shares.join(', ')) : '') + _('Make sure nothing is copying to it.'),
			_('Eject'),
			() => nas.callUsbEject(u.dev).then((res) => {
				if (!res || !res.error) {
					nas.notify(_('%s is ejected. You can unplug it now.').format(u.model || u.dev));
					this.refresh();
				}
				return res;
			}));
	},

	rename(s) {
		const name = E('input', { type: 'text', value: s.name || s.hostname || '', maxlength: 40, placeholder: _("e.g. Family NAS") });
		const host = E('input', { type: 'text', value: (s.hostname || '').toLowerCase(), maxlength: 15, autocapitalize: 'off', spellcheck: 'false' });
		const err = E('div', { class: 'nas-error' });
		const preview = E('span', { style: 'font-family:var(--nas-mono)' });
		const upd = () => { preview.textContent = (host.value.trim().toLowerCase() || '…') + '.local'; };
		host.addEventListener('input', upd); upd();

		ui.showModal(_('Change name'), [
			E('div', { class: 'nas-form' }, [
				nas.field(_('Name'), name, _('Shown in Finder, Windows Network and on this page.')),
				nas.field(_('Local name'), host, [ _('Network address: '), preview, E('br'),
					_('Lowercase letters, digits and -, up to 15 characters.') ])
			]),
			E('p', { class: 'nas-muted nas-small' }, _('Connected computers lose the connection for a few seconds. If you change the local name, Time Machine and saved shortcuts to the old address need to be pointed at the new one, and you sign in to this page again.')),
			err,
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', { class: 'btn cbi-button cbi-button-positive', click: ui.createHandlerFn(this, () => {
					const h = host.value.trim().toLowerCase();
					return nas.callNamesSet(name.value.trim(), h).then((res) => {
						if (res && res.error) { err.textContent = res.error; return; }
						ui.hideModal();
						if (h != (s.hostname || '').toLowerCase() && location.hostname.toLowerCase() == (s.hostname || '').toLowerCase() + '.local') {
							nas.notify(_('Renamed. Moving to %s.local…').format(h));
							setTimeout(() => { location.href = location.protocol + '//' + h + '.local' + location.pathname; }, 6000);
						} else {
							nas.notify(_('Renamed. Finder and Windows show the new name within a minute.'));
							setTimeout(() => this.refresh(), 4000);
						}
					});
				}) }, _('Save'))
			])
		]);
	},

	setLink(s) {
		const l = s && s.link;
		if (!this.chart || !l) return;
		let el;
		if (!l.up) el = nas.pill(_('Cable unplugged'), 'bad');
		else {
			const sp = l.speed >= 1000 ? (l.speed / 1000) + ' Gb/s' : (l.speed > 0 ? l.speed + ' Mb/s' : _('Connected'));
			const half = l.duplex && l.duplex != 'full';
			el = nas.pill(sp + (half ? ' · ' + _('half duplex') : ''), (l.speed > 0 && l.speed < 1000) || half ? 'warn' : 'ok');
			el.title = (l.speed > 0 && l.speed < 1000) || half
				? _('Slower than this NAS can do (1 Gb/s). Check the cable and the router or switch port.')
				: _('Network link speed');
		}
		this.chart.link.replaceChildren(el);
	},

	refresh() {
		return Promise.all([ nas.callOverview(), nas.callShares().catch(() => ({ shares: this.shares })) ]).then(L.bind(function(r) {
			this.shares = r[1]?.shares || this.shares;
			this.setLink(r[0].system);
			this.topEl.replaceChildren(this.renderTop(r[0]));
			this.bottomEl.replaceChildren(this.renderBottom(r[0], this.shares));
		}, this));
	},

	renderTop(d) {
		return E('div', {}, [ this.renderHero(d), this.renderStats(d) ]);
	},

	renderBottom(d, shares) {
		const bays = [ 1, 2 ].map((n) => this.renderBay(n, (d.disks || []).find((x) => x.bay == n), d.raid));
		return E('div', {}, [
			E('div', { class: 'nas-grid-2' }, [ this.renderShares(shares), this.renderServices(d) ]),
			E('div', { class: 'nas-section-title' }, _('Drive bays')),
			E('div', { class: 'nas-grid-2' }, bays),
			this.renderUsb(d)
		]);
	},

	power(action) {
		const off = action == 'poweroff';
		nas.confirm(off ? _('Shut down the NAS?') : _('Restart the NAS?'),
			off ? _('File sharing stops. When the power light goes off, it is safe to unplug the NAS.')
				: _('File sharing is unavailable for about two minutes while the NAS restarts.'),
			off ? _('Shut down') : _('Restart'),
			() => nas.callPower(action).then((res) => {
				if (!res || !res.error)
					nas.notify(off ? _('Shutting down… the power light will turn off when it is safe to unplug.')
						: _('Restarting… this page will be reachable again in about two minutes.'));
				return res;
			}), off);
	},

	render(data) {
		const [ d, sh, st, cold ] = data;
		this.shares = sh?.shares || [];
		this.pushStats(st);

		const top = E('div', {}, this.renderTop(d));
		const bottom = E('div', {}, this.renderBottom(d, this.shares));
		this.topEl = top; this.bottomEl = bottom;
		const chart = this.renderChartCard();
		this.setLink(d.system);

		this.coldEl = E('div');
		this.coldInit(cold);
		this.coldRender();

		const root = E('div', { class: 'nas' }, [ top, chart, bottom, this.coldEl ]);
		this.drawChart();

		poll.add(L.bind(function() {
			return nas.callStats().then(L.bind(function(s) {
				this.pushStats(s);
				this.drawChart();
				const soc = document.getElementById('nas-soc'), sp = document.getElementById('nas-soc-spark');
				if (soc && s && s.soc_temp != null) soc.replaceChildren(Math.round(s.soc_temp), E('small', {}, '°C'));
				if (sp) sp.replaceChildren(nas.spark(this.socHistory, _('Processor temperature, recent')));
			}, this));
		}, this), STATS_INTERVAL);

		poll.add(L.bind(function() { return this.refresh(); }, this), 15);
		poll.add(L.bind(function() { return this.coldRefresh(); }, this), 2);   /* fetches every 2 s while copying, else every 10 s */

		return root;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
