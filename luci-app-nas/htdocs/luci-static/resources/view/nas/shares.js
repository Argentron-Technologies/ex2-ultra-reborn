'use strict';
'require view';
'require ui';
'require nas.common as nas';

const NEW_FOLDER = '\u0000new';

return view.extend({
	load() {
		nas.css();
		return nas.callShares();
	},

	refresh() {
		return nas.callShares().then((d) => {
			this.data = d;
			const box = document.getElementById('nas-shares');
			if (box) box.replaceChildren(this.renderShares(d));
		});
	},

	folderOf(s) {
		return (s.path || '').replace(/^.*\//, '');
	},

	renderShares(d) {
		if (!d.shares.length)
			return E('div', { class: 'nas-empty' }, [ nas.icon('folder', ''), E('div', {}, [
				E('b', {}, _('No shares yet')), E('br'), _('Create a share to make a folder available on your network.') ]) ]);

		const shares = d.shares.slice().sort((a, b) => a.name.localeCompare(b.name));
		return E('div', { class: 'nas-grid' }, shares.map((s) => {
			const users = Object.keys(s.access).sort();
			const chips = [];
			if (s.timemachine) chips.push(nas.pill(_('Time Machine') + (s.tm_cap ? ' · ' + (s.tm_cap >= 1000 ? (s.tm_cap / 1000) + ' TB' : s.tm_cap + ' GB') + ' ' + _('cap') : ''), 'info'));
			if (s.guest) chips.push(nas.pill(_('Guest access'), 'warn'));
			if (!s.exists) chips.push(nas.pill(_('Folder missing'), 'bad'));
			if (!users.length && !s.guest) chips.push(nas.pill(_('Nobody has access'), ''));

			return E('div', { class: 'nas-card' }, [
				E('div', { class: 'nas-row' }, [
					nas.tile(s.timemachine ? 'clock' : 'folder', s.timemachine ? 'green' : (s.guest ? 'orange' : '')),
					E('div', { class: 'nas-grow' }, [
						E('div', { class: 'nas-name nas-ellipsis' }, s.name),
						E('div', { class: 'nas-muted nas-small nas-ellipsis' }, s.path)
					])
				]),
				chips.length ? E('div', { class: 'nas-chips' }, chips) : '',
				users.length ? E('div', { class: 'nas-avstack' }, users.map((u) => E('span', {
					class: 'nas-avitem', title: s.access[u] == 'ro' ? _('Read only') : _('Read & write') }, [
					nas.avatar(u, true), u, E('em', {}, s.access[u] == 'ro' ? _('READ') : _('R/W'))
				]))) : '',
				E('div', { class: 'nas-card-foot' }, [
					nas.button(_('Edit'), 'edit', () => this.editDialog(s)),
					nas.button(_('Delete'), 'trash', () => this.deleteDialog(s), 'danger')
				])
			]);
		}));
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

	editDialog(share) {
		const d = this.data;
		const isNew = !share;
		const s = share || { id: '', name: '', path: '', access: {}, guest: false, timemachine: false, tm_cap: null };
		const access = Object.assign({}, s.access);
		const err = E('div', { class: 'nas-error' });

		const name = E('input', { type: 'text', value: s.name, placeholder: _('e.g. Photos') });

		const folders = d.folders.slice();
		const cur = this.folderOf(s);
		if (cur && folders.indexOf(cur) < 0) folders.unshift(cur);
		const folderSel = E('select', {}, [
			...folders.map((f) => E('option', { value: f, selected: f === cur ? '' : null }, f)),
			E('option', { value: NEW_FOLDER, selected: isNew ? '' : null }, _('➕ New folder…'))
		]);
		const newFolder = E('input', { type: 'text', placeholder: _('Name of the new folder'), style: 'margin-top:8px' });
		const syncFolder = () => { newFolder.style.display = folderSel.value === NEW_FOLDER ? '' : 'none'; };
		folderSel.addEventListener('change', () => {
			syncFolder();
			if (folderSel.value !== NEW_FOLDER && !name.value.trim()) name.value = folderSel.value;
		});
		name.addEventListener('input', () => { if (folderSel.value === NEW_FOLDER) newFolder.value = name.value.trim(); });
		syncFolder();

		const rows = d.users.length ? d.users.map((u) => E('tr', {}, [
			E('td', {}, E('div', { class: 'nas-row', style: 'gap:8px' }, [ nas.avatar(u.name, true), u.name ])),
			E('td', { style: 'text-align:right' }, this.segmented(access[u.name], (v) => {
				if (v) access[u.name] = v; else delete access[u.name];
			}))
		])) : [ E('tr', {}, E('td', { class: 'nas-muted' }, _('No users yet. Add users on the Users page.'))) ];

		const guest = E('input', { type: 'checkbox', checked: s.guest ? '' : null });
		const tm = E('input', { type: 'checkbox', checked: s.timemachine ? '' : null });
		const cap = E('input', { type: 'number', min: '0', step: '50', value: s.tm_cap || 1000, style: 'width:110px' });
		const capRow = E('div', { class: 'nas-field', style: 'margin:-4px 0 0 34px' }, [
			E('label', {}, _('Maximum size for backups (GB)')), cap,
			E('div', { class: 'nas-hint' }, _('Time Machine deletes the oldest backups when this limit is reached. 0 = no limit.'))
		]);
		const syncTm = () => { capRow.style.display = tm.checked ? '' : 'none'; };
		tm.addEventListener('change', syncTm);
		syncTm();

		ui.showModal(isNew ? _('New share') : _('Edit share "%s"').format(s.name), [
			E('div', { class: 'nas form nas-form' }, [
				nas.field(_('Share name'), name, _('The name people see when browsing the NAS.')),
				nas.field(_('Folder'), E('div', {}, [ folderSel, newFolder ]), _('Folder on the NAS disk (') + d.base + ')'),
				E('div', { class: 'nas-field' }, [ E('label', {}, _('Who can access it')), E('table', { class: 'nas-access' }, rows) ]),
				E('label', { class: 'nas-switch' }, [ guest, E('div', {}, [
					E('b', {}, _('Guest access')),
					E('span', {}, _('Anyone on your network can open this share without a password.')) ]) ]),
				E('label', { class: 'nas-switch' }, [ tm, E('div', {}, [
					E('b', {}, _('Time Machine backups')),
					E('span', {}, _('Macs can use this share as a Time Machine backup disk.')) ]) ]),
				capRow,
				err
			]),
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', { class: 'btn cbi-button cbi-button-positive', click: ui.createHandlerFn(this, () => {
					const create = folderSel.value === NEW_FOLDER;
					const folder = create ? newFolder.value.trim() : folderSel.value;
					if (!name.value.trim()) { err.textContent = _('Please enter a share name.'); return; }
					if (!folder) { err.textContent = _('Please choose or name a folder.'); return; }
					return nas.callShareSave(s.id || '', name.value.trim(), folder, create, access,
						guest.checked, tm.checked, tm.checked ? (parseInt(cap.value, 10) || 0) : 0).then((res) => {
						if (res && res.error) { err.textContent = res.error; return; }
						ui.hideModal();
						nas.notify(isNew ? _('Share "%s" created.').format(name.value.trim()) : _('Share "%s" saved.').format(name.value.trim()));
						return this.refresh();
					});
				}) }, isNew ? _('Create share') : _('Save'))
			])
		]);
		(isNew ? name : folderSel).focus();
	},

	deleteDialog(s) {
		nas.confirm(_('Delete share "%s"?').format(s.name),
			_('The share disappears from the network. The folder and its files stay on the disk.'),
			_('Delete share'),
			() => nas.callShareDelete(s.id).then((res) => {
				if (!res || !res.error) { nas.notify(_('Share "%s" deleted.').format(s.name)); this.refresh(); }
				return res;
			}), true);
	},

	render(d) {
		this.data = d;
		return E('div', { class: 'nas' }, [
			E('div', { class: 'nas-head' }, [
				E('div', {}, [ E('h2', {}, _('Shares')),
					E('p', {}, _('Folders available on your network, and who can use them')) ]),
				E('div', { class: 'nas-actions' }, [
					nas.button(_('New share'), 'plus', () => this.refresh().then(() => this.editDialog(null)), 'primary')
				])
			]),
			E('div', { id: 'nas-shares' }, this.renderShares(d))
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
