'use strict';
'require baseclass';
'require ui';

/*
 * NAS OS theme for LuCI - sidebar menu, tab menu and display preferences.
 * Licensed to the public under the Apache License 2.0.
 */

const ACCENTS = [
	[ 'mint',  _('Mint'),  '#3fbf93' ],
	[ 'sky',   _('Sky'),   '#4fa3dc' ],
	[ 'coral', _('Coral'), '#f07a58' ],
	[ 'amber', _('Amber'), '#e9b23e' ],
	[ 'rose',  _('Rose'),  '#e06a9e' ],
	[ 'mono',  _('Mono'),  'linear-gradient(135deg,#e9ebee 50%,#1b1d21 50%)' ]
];

const MODES = [ 'auto', 'light', 'dark' ];

const SVG = (paths, size) =>
	'<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

/* Icon paths from Lucide (https://lucide.dev), ISC License. */
const ICONS = {
	nas:        SVG('<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>'),
	status:     SVG('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
	system:     SVG('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
	services:   SVG('<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>'),
	network:    SVG('<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>'),
	vpn:        SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
	statistics: SVG('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'),
	docker:     SVG('<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/>'),
	logout:     SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'),
	dashboard:  SVG('<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>'),
	folder:     SVG('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
	users:      SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
	general:    SVG('<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'),
	key:        SVG('<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'),
	download:   SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>'),
	storage:    SVG('<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>'),
	_default:   SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5"/>')
};

const MODE_ICONS = {
	auto:  SVG('<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
	light: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
	dark:  SVG('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')
};

const CHEVRON = SVG('<path d="m9 18 6-6-6-6"/>', 14).replace('<svg ', '<svg class="nos-chev" ');

/* The category shown as the main navigation, and the everyday settings pages. */
const PRIMARY = 'nas';

const PRIMARY_ICONS = {
	overview: 'dashboard',
	shares:   'folder',
	users:    'users',
	disks:    'storage',
	storage:  'storage',
	usb:      'storage'
};

const SETTINGS = [
	[ 'system',  'system',  'general',  _('General') ],
	[ 'system',  'admin',   'key',      _('Password & SSH') ],
	[ 'network', 'network', 'network',  _('Network') ],
	[ 'system',  'flash',   'download', _('Backup & update') ]
];

function toggleGroup(ev) {
	const group = ev.currentTarget.parentNode;
	const open = !group.classList.contains('open');
	group.classList.toggle('open', open);
	ev.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function icon(name) {
	const span = E('span', { 'class': 'nos-ico' });
	span.innerHTML = ICONS[name] || ICONS._default;
	return span;
}

function store(key, value) {
	try {
		if (value === undefined)
			return localStorage.getItem(key);
		localStorage.setItem(key, value);
	}
	catch (e) {}
	return null;
}

return baseclass.extend({
	__init__() {
		ui.menu.load().then((tree) => this.render(tree));
		this.renderPrefs();
		this.bindMobile();
	},

	render(tree) {
		const mode = this.renderModeMenu(tree);

		if (mode)
			this.renderSideMenu(mode.node, mode.name);

		if (L.env.dispatchpath.length >= 3) {
			let node = tree, url = '';

			for (let i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderModeMenu(tree) {
		const ul = document.querySelector('#modemenu');
		const children = ui.menu.getChildren(tree);
		let active = null;

		children.forEach((child, index) => {
			const isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0] : index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, [ _(child.title) ])
			]));

			if (isActive)
				active = { node: child, name: child.name };
		});

		if (ul.children.length > 1)
			ul.style.display = '';

		return active;
	},

	/*
	 * Sidebar layout:
	 *   1. Primary   - the pages of the "nas" category, shown as top-level items
	 *   2. Settings  - a short curated list of everyday system pages
	 *   3. Advanced  - every other LuCI category, collapsed by default
	 * Without a "nas" category it falls back to plain grouped categories.
	 */
	renderSideMenu(tree, base) {
		const nav = document.querySelector('#nos-nav');
		const cats = ui.menu.getChildren(tree);
		const path = L.env.dispatchpath;
		const byName = {};
		cats.forEach((c) => byName[c.name] = c);

		const link = (href, iconName, title, active, cls) => E('a', {
			'class': (cls || 'nos-cat') + (active ? ' active' : ''),
			'href': href,
			'aria-current': active ? 'page' : null
		}, [ iconName ? icon(iconName) : '', E('span', { 'class': 'nos-label' }, [ title ]) ]);

		const primary = byName[PRIMARY];
		const used = {};
		let logout = byName.logout;
		let inAdvanced = false;

		/* 1. primary */
		if (primary) {
			used[PRIMARY] = true;
			ui.menu.getChildren(primary).forEach((item) => {
				const active = path[1] === PRIMARY && path[2] === item.name;
				nav.appendChild(link(L.url(base, PRIMARY, item.name), PRIMARY_ICONS[item.name] || 'nas', _(item.title), active));
				if (active) this.setCrumb(_(primary.title), _(item.title));
			});
		}

		/* 2. settings */
		const settings = SETTINGS.filter((s) => {
			const c = byName[s[0]];
			return c && c.children && c.children[s[1]] && !(c.children[s[1]].satisfied === false);
		});

		if (primary && settings.length) {
			nav.appendChild(E('div', { 'class': 'nos-nav-label' }, [ _('Settings') ]));
			settings.forEach(([ cat, page, iconName, title ]) => {
				const active = path[1] === cat && path[2] === page;
				nav.appendChild(link(L.url(base, cat, page), iconName, title, active));
				if (active) this.setCrumb(_('Settings'), title);
			});
		}

		/* 3. everything else */
		const rest = cats.filter((c) => !used[c.name] && c.name !== 'logout');
		const groupBox = primary ? E('div', { 'class': 'nos-items nos-adv-items' }) : nav;

		rest.forEach((cat) => {
			const items = ui.menu.getChildren(cat);
			const catActive = path[1] === cat.name;
			const settingsHit = settings.some((s) => s[0] === cat.name && s[1] === path[2]);

			if (catActive && !settingsHit)
				inAdvanced = true;

			if (!items.length) {
				groupBox.appendChild(link(L.url(base, cat.name), cat.name, _(cat.title), catActive));
				return;
			}

			const list = E('div', { 'class': 'nos-items' });

			items.forEach((item) => {
				const isActive = catActive && path[2] === item.name;
				list.appendChild(link(L.url(base, cat.name, item.name), null, _(item.title), isActive, 'nos-item'));
				if (isActive && !settingsHit)
					this.setCrumb(_(cat.title), _(item.title));
			});

			const open = catActive && !settingsHit;
			const head = E('button', {
				'type': 'button',
				'class': 'nos-cat' + (open ? ' current' : ''),
				'aria-expanded': open ? 'true' : 'false',
				'click': toggleGroup
			}, [ icon(cat.name), E('span', { 'class': 'nos-label' }, [ _(cat.title) ]) ]);

			head.insertAdjacentHTML('beforeend', CHEVRON);
			groupBox.appendChild(E('div', { 'class': 'nos-group' + (open ? ' open' : '') }, [ head, list ]));
		});

		if (primary && rest.length) {
			const head = E('button', {
				'type': 'button',
				'class': 'nos-nav-label nos-adv-toggle',
				'aria-expanded': inAdvanced ? 'true' : 'false',
				'click': toggleGroup
			}, [ E('span', { 'class': 'nos-label' }, [ _('Advanced') ]) ]);

			head.insertAdjacentHTML('beforeend', CHEVRON);
			nav.appendChild(E('div', { 'class': 'nos-group nos-adv' + (inAdvanced ? ' open' : '') }, [ head, groupBox ]));
		}

		if (logout) {
			nav.appendChild(E('div', { 'class': 'nos-nav-spacer' }));
			nav.appendChild(link(L.url(base, 'logout'), 'logout', _(logout.title), false, 'nos-cat nos-logout'));
		}
	},

	setCrumb(section, page) {
		const crumb = document.querySelector('#nos-crumb');
		crumb.innerHTML = '';
		crumb.appendChild(E('span', {}, [ section ]));
		crumb.appendChild(E('span', { 'class': 'nos-crumb-sep', 'aria-hidden': 'true' }, [ '/' ]));
		crumb.appendChild(E('b', {}, [ page ]));
	},

	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const ul = E('ul', { 'class': 'tabs' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		children.forEach((child) => {
			const isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);

			ul.appendChild(E('li', { 'class': 'tabmenu-item-%s %s'.format(child.name, isActive ? 'active' : '') }, [
				E('a', { 'href': L.url(url, child.name) }, [ _(child.title) ])
			]));

			if (isActive)
				activeNode = child;
		});

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderPrefs() {
		const box = document.querySelector('#nos-prefs');
		const root = document.documentElement;

		if (!box)
			return;

		const swatches = E('div', { 'class': 'nos-accents', 'role': 'group', 'aria-label': _('Accent colour') });

		ACCENTS.forEach(([ name, title, paint ]) => {
			const btn = E('button', {
				'type': 'button',
				'class': 'nos-swatch' + (root.getAttribute('data-accent') === name ? ' on' : ''),
				'title': title,
				'aria-label': title,
				'aria-pressed': root.getAttribute('data-accent') === name ? 'true' : 'false',
				'style': 'background:' + paint,
				'click': () => {
					root.setAttribute('data-accent', name);
					store('nasos.accent', name);
					swatches.querySelectorAll('.nos-swatch').forEach((el) => {
						const on = el === btn;
						el.classList.toggle('on', on);
						el.setAttribute('aria-pressed', on ? 'true' : 'false');
					});
				}
			});

			swatches.appendChild(btn);
		});

		const modeBtn = E('button', { 'type': 'button', 'class': 'nos-iconbtn nos-mode' });
		const paintMode = () => {
			const mode = root.getAttribute('data-mode') || 'auto';
			const label = { auto: _('Appearance: automatic'), light: _('Appearance: light'), dark: _('Appearance: dark') }[mode];
			modeBtn.innerHTML = MODE_ICONS[mode];
			modeBtn.setAttribute('title', label);
			modeBtn.setAttribute('aria-label', label);
		};

		modeBtn.addEventListener('click', () => {
			const current = root.getAttribute('data-mode') || 'auto';
			const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
			store('nasos.mode', next);
			window.nasosApplyMode(next);
			paintMode();
		});

		paintMode();
		box.appendChild(swatches);
		box.appendChild(modeBtn);
	},

	bindMobile() {
		const toggle = document.querySelector('#nos-menu-toggle');
		const scrim = document.querySelector('#nos-scrim');
		const body = document.body;

		if (!toggle || !scrim)
			return;

		const set = (open) => {
			body.classList.toggle('nos-nav-open', open);
			scrim.hidden = !open;
			toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		};

		toggle.addEventListener('click', () => set(!body.classList.contains('nos-nav-open')));
		scrim.addEventListener('click', () => set(false));
		document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') set(false); });
	}
});
