'use strict';
'require view';
'require ui';
'require nas.common as nas';

return view.extend({
	load() {
		nas.css();
		return nas.callShares();
	},

	refresh() {
		return nas.callShares().then((d) => {
			const box = document.getElementById('nas-users');
			if (box) box.replaceChildren(this.renderUsers(d));
		});
	},

	sharesFor(d, name) {
		return d.shares.filter((s) => s.access[name] || s.guest)
			.map((s) => ({ name: s.name, ro: s.access[name] == 'ro' || (!s.access[name] && s.guest) }));
	},

	renderUsers(d) {
		if (!d.users.length)
			return E('div', { class: 'nas-empty' }, [ nas.icon('users', ''), E('div', {}, [
				E('b', {}, _('No users yet')), E('br'), _('Add a user to give people or devices access to your shares.') ]) ]);

		return E('div', { class: 'nas-grid' }, d.users.map((u) => {
			const shares = this.sharesFor(d, u.name);
			return E('div', { class: 'nas-card' }, [
				E('div', { class: 'nas-row' }, [
					nas.avatar(u.name),
					E('div', { class: 'nas-grow' }, [
						E('div', { class: 'nas-name nas-ellipsis' }, u.name),
						u.samba ? nas.pill(_('Ready'), 'ok') : nas.pill(_('No password set'), 'warn')
					])
				]),
				E('div', { class: 'nas-small nas-muted', style: 'margin-top:14px' },
					shares.length ? _('Access to %d shares').format(shares.length) : _('No access to any share yet')),
				E('div', { class: 'nas-chips' }, shares.slice(0, 8).map((s) =>
					E('span', { class: 'nas-chip', title: s.ro ? _('Read only') : _('Read & write') }, s.name + (s.ro ? ' · ' + _('read') : ''))
				).concat(shares.length > 8 ? [ E('span', { class: 'nas-chip' }, '+' + (shares.length - 8)) ] : [])),
				E('div', { class: 'nas-card-foot' }, [
					nas.button(u.samba ? _('Change password') : _('Set password'), 'key', () => this.passwordDialog(u.name, !u.samba)),
					nas.button(_('Delete'), 'trash', () => this.deleteDialog(u.name), 'danger')
				])
			]);
		}));
	},

	passwordInputs() {
		const pw = E('input', { type: 'password', autocomplete: 'new-password', placeholder: _('At least 4 characters') });
		const pw2 = E('input', { type: 'password', autocomplete: 'new-password', placeholder: _('Type it again') });
		return [ pw, pw2 ];
	},

	addDialog(d) {
		const name = E('input', { type: 'text', autocomplete: 'off', placeholder: _('e.g. anna, laptop, tv') });
		const [ pw, pw2 ] = this.passwordInputs();
		const allShares = E('input', { type: 'checkbox' });
		const err = E('div', { class: 'nas-error' });

		ui.showModal(_('Add user'), [
			E('div', { class: 'nas form nas-form' }, [
				nas.field(_('Username'), name, _('Lowercase letters, digits, _ or -. This is the name used to connect.')),
				nas.field(_('Password'), pw),
				nas.field(_('Confirm password'), pw2),
				E('label', { class: 'nas-switch' }, [ allShares, E('div', {}, [
					E('b', {}, _('Give access to all shares')),
					E('span', {}, _('Read & write on every share. You can fine-tune this on the Shares page.')) ]) ]),
				err
			]),
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', { class: 'btn cbi-button cbi-button-positive', click: ui.createHandlerFn(this, () => {
					const n = name.value.trim().toLowerCase();
					if (pw.value !== pw2.value) { err.textContent = _('The passwords do not match.'); return; }
					return nas.callUserAdd(n, pw.value).then((res) => {
						if (res && res.error) { err.textContent = res.error; return; }
						if (!allShares.checked) return;
						return Promise.all(d.shares.map((s) => {
							const access = Object.assign({}, s.access);
							access[n] = 'rw';
							return nas.callShareSave(s.id, s.name, s.path.replace(/^.*\//, ''), false,
								access, s.guest, s.timemachine, s.tm_cap || 0);
						}));
					}).then(() => {
						if (err.textContent) return;
						ui.hideModal();
						nas.notify(_('User "%s" added.').format(n));
						return this.refresh();
					});
				}) }, _('Add user'))
			])
		]);
		name.focus();
	},

	passwordDialog(user, isNew) {
		const [ pw, pw2 ] = this.passwordInputs();
		const err = E('div', { class: 'nas-error' });
		ui.showModal((isNew ? _('Set password for %s') : _('Change password for %s')).format(user), [
			E('div', { class: 'nas form nas-form' }, [
				nas.field(_('New password'), pw), nas.field(_('Confirm password'), pw2), err
			]),
			E('div', { class: 'right' }, [
				E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')), ' ',
				E('button', { class: 'btn cbi-button cbi-button-positive', click: ui.createHandlerFn(this, () => {
					if (pw.value !== pw2.value) { err.textContent = _('The passwords do not match.'); return; }
					return nas.callUserPasswd(user, pw.value).then((res) => {
						if (res && res.error) { err.textContent = res.error; return; }
						ui.hideModal();
						nas.notify(_('Password for "%s" saved.').format(user));
						return this.refresh();
					});
				}) }, _('Save password'))
			])
		]);
		pw.focus();
	},

	deleteDialog(user) {
		nas.confirm(_('Delete user "%s"?').format(user),
			_('This removes the user and their access to all shares. Files in the shares are not deleted.'),
			_('Delete user'),
			() => nas.callUserDel(user).then((res) => {
				if (!res || !res.error) { nas.notify(_('User "%s" deleted.').format(user)); this.refresh(); }
				return res;
			}), true);
	},

	render(d) {
		return E('div', { class: 'nas' }, [
			E('div', { class: 'nas-head' }, [
				E('div', {}, [ E('h2', {}, _('Users')),
					E('p', {}, _('People and devices that can connect to your shares')) ]),
				E('div', { class: 'nas-actions' }, [
					nas.button(_('Add user'), 'plus', () => nas.callShares().then((fresh) => this.addDialog(fresh)), 'primary')
				])
			]),
			E('div', { id: 'nas-users' }, this.renderUsers(d))
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
