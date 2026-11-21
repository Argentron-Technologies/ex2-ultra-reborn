'use strict';
'require view';
'require ui';
'require nas.common as nas';

/* NFS page (optional plugin: ./plugins.sh nfs install). NFS has no passwords, so access goes
 * by computer: the named computers (name + IP address) and the whole home network, each
 * Read & write / Read only / No access per NFS share. The share list itself is kept by
 * /usr/sbin/nas-nfs, which the command line uses too. */

const NEW_FOLDER = '\u0000new';

return view.extend({
	load() {
		nas.css();
		return nas.callNfsInfo();
	},

	refresh() {
		return nas.callNfsInfo().then((d) => {
			this.data = d;
			const box = document.getElementById('nas-nfs');
			if (box) box.replaceChildren(...this.renderBody(d));
		});
	},

	/* how a computer shows: its name, "Whole home network", or the plain address */
	label(d, who) {
		if (who == d.lan) return _('Whole home network');
		const c = (d.computers || []).find((x) => x.ip == who);
		return c ? c.name : who;
	},

	segmented(value, onChange) {
		const opts = [ [ 'rw', _('Read & write'), '' ], [ 'ro', _('Read only'), 'ro' ], [ '', _('No access'), 'no' ] ];
		const box = E('div', { class: 'nas-seg' });
		let current = value || '';
		const paint = () => box.querySelectorAll('button').forEach((b) =>
			b.classList.toggle('on', b.dataset.v === current));
		opts.forEach(([ v, label, cls ]) => box.appendChild(E('button', {
			type: 'button', class: cls, 'data-v': v,
			click: (ev) => { ev.preventDefault(); current = v; paint(); onChange(v); }
		}, label)));
		paint();
		return box;
	},

	/* ------------------------------------------------------------------ server */

	renderServer(d) {
		const on = d.state != 'off';
		const kind = d.state == 'running' ? 'ok' : d.state == 'off' ? 'off' : 'bad';
		const text = d.state == 'running' ? _('Running') : d.state == 'off' ? _('Off') : _('Stopped');
		/* a slim full-width bar: title and state, one line of detail, the on/off button */
		return E('section', { class: 'nas-card', style: 'padding:14px 20px;margin-bottom:16px' }, [
			E('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap' }, [
				E('div', { style: 'display:flex;align-items:center;gap:12px;flex-shrink:0' }, [
					E('h3', { style: 'margin:0' }, _('NFS server')),
					E('span', { class: 'nas-state ' + kind }, [ E('span', { class: 'nas-led ' + kind }), text ])
				]),
				E('div', { class: 'nas-muted nas-small', style: 'flex:1;min-width:200px' }, d.state == 'off'
					? _('Nothing is shared over NFS, also not after a restart. Your NFS shares and computers are kept.')
					: d.state == 'running'
						? (d.shares.length == 1 ? _('1 folder is shared over NFS.') : _('%d folders are shared over NFS.').format(d.shares.length))
						: _('Switched on, but not running. Switch it off and on again; if it stays stopped, check the log: logread | grep nfs')),
				nas.button(on ? _('Switch off') : _('Switch on'), 'power', () => nas.callNfsSet(!on).then((res) => {
					if (res && res.error) { nas.notify(res.error, 'danger'); return; }
					nas.notify(on ? _('NFS is off: nothing is shared over NFS. Your NFS shares are kept.') : _('NFS is on: your NFS shares are available again.'));
					return this.refresh();
				}), on ? 'danger' : 'primary')
			])
		]);
	},

	/* ------------------------------------------------------------------ computers */

	renderComputers(d) {
		const list = d.computers || [];
		const uses = (ip) => d.shares.filter((s) => s.access[ip]).length;
		return E('section', { class: 'nas-card', style: 'margin-bottom:16px' }, [
			E('div', { class: 'nas-card-head' }, [
				E('h3', {}, _('Computers')),
				nas.button(_('Add computer'), 'plus', () => this.computerDialog(null))
			]),
			list.length ? E('div', {}, list.map((c) => E('div', { class: 'nas-list-row' }, [
				E('div', { class: 'nas-row', style: 'gap:10px;min-width:0' }, [
					nas.avatar(c.name, true),
					E('div', { style: 'min-width:0' }, [
						E('div', { class: 'nas-ellipsis' }, c.name),
						E('div', { class: 'nas-muted nas-small' }, c.ip + ' · ' +
							(uses(c.ip) == 1 ? _('1 NFS share') : _('%d NFS shares').format(uses(c.ip))))
					])
				]),
				E('div', { style: 'display:flex;gap:6px' }, [
					E('button', { class: 'nas-chip nas-chip-btn', title: _('Edit'), click: () => this.computerDialog(c) }, nas.icon('edit', 'nas-ico')),
					E('button', { class: 'nas-chip nas-chip-btn', title: _('Remove'), click: () => this.removeComputer(c, uses(c.ip)) }, nas.icon('trash', 'nas-ico'))
				])
			]))) : E('p', { class: 'nas-muted nas-small', style: 'margin:4px 0' },
				_('No computers yet. Add the Linux computers that should use NFS shares, by name and IP address.')),
			E('p', { class: 'nas-hint', style: 'margin-top:12px' },
				_('NFS has no passwords: a computer is known by its IP address. Give each one a fixed address in your router so it keeps it. On Linux, "hostname -I" shows it.'))
		]);
	},

	computerDialog(c) {
		const d = this.data;
		const name = E('input', { type: 'text', value: c ? c.name : '', placeholder: _('e.g. Linux PC') });
		const ip = E('input', { type: 'text', value: c ? c.ip : '', placeholder: _('e.g. 192.168.1.20'), inputmode: 'decimal', autocomplete: 'off' });
		const err = E('div', { class: 'nas-error' });
		ui.showModal(c ? _('Edit computer "%s"').format(c.name) : _('Add computer'), [
			E('div', { class: 'nas form nas-form' }, [
				nas.field(_('Name'), name, _('Any name that tells you which computer it is.')),
				nas.field(_('IP address'), ip, _('Its IPv4 address on your network. Changing it keeps the computer\'s access to its NFS shares.')),
				err
			]),
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', { class: 'btn cbi-button cbi-button-positive', click: ui.createHandlerFn(this, () => {
					const n = name.value.trim(), a = ip.value.trim();
					if (!n || !a) { err.textContent = _('Please enter a name and an IP address.'); return; }
					const list = (d.computers || []).filter((x) => !c || x.ip != c.ip).map((x) => ({ name: x.name, ip: x.ip }));
					list.push({ name: n, ip: a });
					/* the state stays as it is: only the computer list is sent */
					return nas.callNfsSet(undefined, list).then((res) => {
						if (res && res.error) { err.textContent = res.error; return; }
						ui.hideModal();
						nas.notify(c ? _('Computer "%s" saved.').format(n) : _('Computer "%s" added. Choose its access on an NFS share (Edit).').format(n));
						return this.refresh();
					});
				}) }, c ? _('Save') : _('Add computer'))
			])
		]);
		(c ? ip : name).focus();
	},

	removeComputer(c, n) {
		const d = this.data;
		nas.confirm(_('Remove computer "%s"?').format(c.name),
			n ? _('It loses NFS access to %d shares. The shares, folders and files stay; a share left without any computer shows "Nobody can connect".').format(n)
				: _('It has no access to any NFS share.'),
			_('Remove'),
			() => nas.callNfsSet(undefined, (d.computers || []).filter((x) => x.ip != c.ip).map((x) => ({ name: x.name, ip: x.ip }))).then((res) => {
				if (!res || !res.error) { nas.notify(_('Computer "%s" removed.').format(c.name)); this.refresh(); }
				return res;
			}), true);
	},

	/* ------------------------------------------------------------------ NFS shares */

	renderShares(d) {
		if (!d.shares.length)
			return E('div', { class: 'nas-empty' }, [ nas.icon('folder', ''), E('div', {}, [
				E('b', {}, _('No NFS shares yet')), E('br'),
				_('Share a folder over NFS so Linux computers can mount it. Folders that are SMB shares can be shared over NFS too.') ]) ]);

		return E('div', { class: 'nas-grid' }, d.shares.map((s) => {
			const who = Object.keys(s.access).sort((a, b) => (a == d.lan) ? -1 : (b == d.lan) ? 1 : this.label(d, a).localeCompare(this.label(d, b)));
			const chips = [];
			if (s.smb.length) chips.push(nas.pill(_('Also SMB') + ': ' + s.smb.join(', '), 'info'));
			if (!s.exists) chips.push(nas.pill(_('Folder missing'), 'bad'));
			if (d.state != 'running') chips.push(nas.pill(_('Server off'), ''));
			/* the share stays when its last computer is removed: nobody may connect until one is chosen */
			if (!who.length) chips.push(nas.pill(_('Nobody can connect'), ''));
			return E('div', { class: 'nas-card' }, [
				E('div', { class: 'nas-row' }, [
					nas.tile('folder', ''),
					E('div', { class: 'nas-grow' }, [
						E('div', { class: 'nas-name nas-ellipsis' }, s.folder),
						E('div', { class: 'nas-muted nas-small nas-ellipsis' }, s.path)
					])
				]),
				chips.length ? E('div', { class: 'nas-chips', style: 'margin-top:12px' }, chips) : '',
				who.length ? E('div', { class: 'nas-avstack' }, who.map((w) => E('span', {
					class: 'nas-avitem', title: (s.access[w] == 'ro' ? _('Read only') : _('Read & write')) + ' · ' + w }, [
					nas.avatar(w == d.lan ? 'LAN' : this.label(d, w), true), this.label(d, w),
					E('em', {}, s.access[w] == 'ro' ? _('READ') : _('R/W'))
				]))) : '',
				E('div', { class: 'nas-card-foot' }, [
					nas.button(_('Edit'), 'edit', () => this.shareDialog(s)),
					nas.button(_('Stop sharing'), 'trash', () => this.stopDialog(s), 'danger')
				])
			]);
		}));
	},

	shareDialog(share) {
		const d = this.data;
		const isNew = !share;
		const access = Object.assign({}, share ? share.access : {});
		const err = E('div', { class: 'nas-error' });

		/* every folder in /mnt/data, with the SMB shares that use it; Time Machine folders and
		 * folders that are already NFS shares can't be picked */
		const folderSel = E('select', {}, [
			...d.folders.map((f) => {
				const mine = share && share.folder == f.name;
				const note = f.timemachine ? ' · ' + _('Time Machine, not possible over NFS')
					: (f.nfs && !mine) ? ' · ' + _('already an NFS share')
					: f.smb.length ? ' · ' + _('SMB share: %s').format(f.smb.join(', ')) : '';
				return E('option', { value: f.name, selected: mine ? '' : null,
					disabled: (f.timemachine || (f.nfs && !mine)) ? '' : null }, f.name + note);
			}),
			E('option', { value: NEW_FOLDER, selected: (isNew && !d.folders.some((f) => !f.timemachine && !f.nfs)) ? '' : null }, _('➕ New folder…'))
		]);
		if (isNew) {
			const first = d.folders.find((f) => !f.timemachine && !f.nfs);
			if (first) folderSel.value = first.name;
		}
		const newFolder = E('input', { type: 'text', placeholder: _('Name of the new folder'), style: 'margin-top:8px' });

		/* plain text node: E() would read "<...>" in a string as HTML */
		const hint = E('code', { style: 'font-family:var(--nas-mono);user-select:all;word-break:break-all' });
		const folderName = () => folderSel.value === NEW_FOLDER ? newFolder.value.trim() : folderSel.value;
		const sync = () => {
			newFolder.style.display = folderSel.value === NEW_FOLDER ? '' : 'none';
			const f = folderName() || 'Folder';
			const q = /\s/.test(f) ? "'" : '';
			hint.textContent = 'sudo mount -t nfs -o vers=3 ' + (d.ip || 'NAS-IP') + ':' + q + d.base + '/' + f + q +
				' /mnt/' + f.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
		};
		folderSel.addEventListener('change', sync);
		newFolder.addEventListener('input', sync);
		sync();

		const rows = [];
		if (d.lan) rows.push([ d.lan, _('Whole home network'), d.lan ]);
		(d.computers || []).forEach((c) => { if (c.ip != d.lan) rows.push([ c.ip, c.name, c.ip ]); });
		Object.keys(access).forEach((w) => {
			if (!rows.some((r) => r[0] == w)) rows.push([ w, w, _('added from the command line') ]);
		});
		const table = E('table', { class: 'nas-access' }, rows.map(([ w, label, sub ]) => E('tr', {}, [
			E('td', {}, E('div', { class: 'nas-row', style: 'gap:8px' }, [
				nas.avatar(w == d.lan ? 'LAN' : label, true),
				E('div', {}, [ E('div', {}, label), E('div', { class: 'nas-muted nas-small' }, sub) ]) ])),
			E('td', { style: 'text-align:right' }, this.segmented(access[w], (v) => {
				if (v) access[w] = v; else delete access[w];
			}))
		])));

		ui.showModal(isNew ? _('New NFS share') : _('Edit NFS share "%s"').format(share.folder), [
			E('div', { class: 'nas form nas-form' }, [
				nas.field(_('Folder'), E('div', {}, [ folderSel, newFolder ]),
					_('Folder on the NAS disk (%s). It can also be an SMB share: both reach the same files.').format(d.base)),
				E('div', { class: 'nas-field' }, [
					E('label', {}, _('Who can connect')), table,
					E('div', { class: 'nas-hint' }, (d.computers || []).length
						? _('A computer\'s own setting wins over the whole home network\'s. "No access" for one computer only works when the whole home network has no access too.')
						: _('To allow single computers, add them under Computers on this page.'))
				]),
				E('div', { class: 'nas-hint' }, [ _('On Linux:'), ' ', hint ]),
				err
			]),
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', { class: 'btn cbi-button cbi-button-positive', click: ui.createHandlerFn(this, () => {
					const create = folderSel.value === NEW_FOLDER;
					const folder = folderName();
					if (!folder) { err.textContent = _('Please choose or name a folder.'); return; }
					return nas.callNfsShareSave(folder, share ? share.folder : '', create, access).then((res) => {
						if (res && res.error) { err.textContent = res.error; return; }
						ui.hideModal();
						nas.notify(isNew ? _('"%s" is now shared over NFS.').format(folder) : _('NFS share "%s" saved.').format(folder));
						return this.refresh();
					});
				}) }, isNew ? _('Share over NFS') : _('Save'))
			])
		]);
		folderSel.focus();
	},

	stopDialog(s) {
		nas.confirm(_('Stop sharing "%s" over NFS?').format(s.folder),
			_('Linux computers can no longer mount it. The folder and its files stay on the disk') +
				(s.smb.length ? _(', and it stays an SMB share.') : '.'),
			_('Stop sharing'),
			() => nas.callNfsShareDelete(s.folder).then((res) => {
				if (!res || !res.error) { nas.notify(_('"%s" is no longer shared over NFS.').format(s.folder)); this.refresh(); }
				return res;
			}), true);
	},

	/* ------------------------------------------------------------------ page */

	renderBody(d) {
		return [
			this.renderServer(d),
			this.renderComputers(d),
			E('h3', { style: 'margin:8px 0 12px' }, _('NFS shares')),
			this.renderShares(d)
		];
	},

	render(d) {
		this.data = d;
		if (!d || d.state == 'missing')
			return E('div', { class: 'nas' }, [
				E('div', { class: 'nas-head' }, [ E('div', {}, [ E('h2', {}, _('NFS')) ]) ]),
				E('div', { class: 'nas-empty' }, [ nas.icon('folder', ''), E('div', {}, [
					E('b', {}, _('NFS is not installed')), E('br'),
					_('It is an optional plugin. Install it from your computer with: ./plugins.sh nfs install') ]) ])
			]);
		return E('div', { class: 'nas' }, [
			E('div', { class: 'nas-head' }, [
				E('div', {}, [ E('h2', {}, _('NFS')),
					E('p', {}, _('Folders Linux computers can mount over NFS, and which computers may connect')) ]),
				E('div', { class: 'nas-actions' }, [
					nas.button(_('New NFS share'), 'plus', () => this.refresh().then(() => this.shareDialog(null)), 'primary')
				])
			]),
			E('div', { id: 'nas-nfs' }, this.renderBody(d))
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
