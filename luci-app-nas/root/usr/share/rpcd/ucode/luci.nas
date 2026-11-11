// luci-app-nas backend: overview, NAS users, shares and power control.
// Loaded by rpcd (rpcd-mod-ucode) as ubus object "luci.nas".
'use strict';

import { popen, readfile, writefile, lsdir, stat, mkdir, readlink } from 'fs';
import { cursor } from 'uci';

const DATA = '/mnt/data';
const HIDDEN_DIRS = [ 'lost+found', 'Nas_Prog', 'otaclient', 'restsdk-data', 'restsdk-info' ];
const RESERVED_USERS = [ 'root', 'daemon', 'ftp', 'network', 'nobody', 'dnsmasq', 'logd', 'ubus',
	'admin', 'guest', 'samba', 'smb', 'apk', 'ntp' ];

function sh(cmd) {
	let p = popen(cmd, 'r');
	if (!p) return '';
	let out = p.read('all') ?? '';
	p.close();
	return out;
}

function shq(s) {
	return "'" + replace(s, "'", "'\\''") + "'";
}

function read1(path) {
	let v = readfile(path);
	return (v != null) ? trim(v) : null;
}

function reload_samba() {
	system('/etc/init.d/samba4 reload >/dev/null 2>&1');
}

/* ---------------------------------------------------------------- overview */

function disk_info(dev) {
	let link = readlink(`/sys/block/${dev}`) ?? '';
	let m = match(link, /\/ata([0-9]+)\//);
	let bay = m ? int(m[1]) : null;
	let usb = index(link, '/usb') >= 0;
	let state = match(sh(`hdparm -C /dev/${dev} 2>/dev/null`), /drive state is:\s+(\S+)/);
	state = state ? state[1] : null;

	let temp = null;
	if (state != 'standby') {
		for (let h in (lsdir(`/sys/block/${dev}/device/hwmon`) ?? [])) {
			let t = read1(`/sys/block/${dev}/device/hwmon/${h}/temp1_input`);
			if (t) temp = int(t) / 1000;
		}
	}

	let smart = sh(`smartctl -n standby -i -H /dev/${dev} 2>/dev/null`);
	let serial = match(smart, /Serial Number:\s+(\S+)/);
	let health = match(smart, /self-assessment test result:\s+(\S+)/);
	let hours = sh(`smartctl -n standby -A /dev/${dev} 2>/dev/null`);
	hours = match(hours, /Power_On_Hours[^\n]*\s(\d+)\s*\n/);

	return {
		dev: dev,
		bay: bay,
		usb: usb,
		model: read1(`/sys/block/${dev}/device/model`),
		size: int(read1(`/sys/block/${dev}/size`) ?? 0) * 512,
		state: state,
		temp: temp,
		serial: serial ? serial[1] : null,
		health: health ? health[1] : null,
		hours: hours ? int(hours[1]) : null
	};
}

// int() of an empty sysfs value is NaN, and NaN breaks the JSON reply (the whole page fails)
function sysfs_int(v) {
	let n = int(v ?? 0);
	return (type(n) == 'int') ? n : 0;
}

function raid_info() {
	/* Read everything from sysfs and /proc/mdstat: unlike `mdadm --detail`
	 * this never touches the disks, so it cannot keep them awake. */
	const md = '/sys/block/md1/md';
	let state = read1(`${md}/array_state`);
	if (state == null) return null;

	let total = sysfs_int(read1(`${md}/raid_disks`));
	let degraded = sysfs_int(read1(`${md}/degraded`));
	let action = read1(`${md}/sync_action`) ?? 'idle';
	let members = [];

	for (let e in (lsdir(md) ?? [])) {
		if (substr(e, 0, 4) != 'dev-') continue;
		let st = read1(`${md}/${e}/state`) ?? '';
		push(members, {
			slot: read1(`${md}/${e}/slot`) ?? '-',
			state: (index(st, 'faulty') >= 0) ? 'faulty' : ((index(st, 'in_sync') >= 0) ? 'active sync' : 'spare rebuilding'),
			dev: substr(e, 4)
		});
	}

	let pct = null, finish = null;
	if (action == 'recover' || action == 'resync') {
		let done = split(read1(`${md}/sync_completed`) ?? '', ' / ');
		if (length(done) == 2 && +done[1] > 0) pct = int(+done[0] * 100 / +done[1]);
		let f = match(readfile('/proc/mdstat') ?? '', /finish=([0-9.]+)min/);
		finish = f ? +f[1] : null;
	}

	// "clear" / "inactive": md1 exists but is not running (e.g. assembly failed at boot)
	let words = (state == 'clear' || state == 'inactive') ? [ 'not running' ] : [ state ];
	if (degraded > 0) push(words, 'degraded');
	if (action == 'recover') push(words, 'recovering');
	if (action == 'resync') push(words, 'resyncing');

	return {
		level: read1(`${md}/level`),
		state: join(', ', words),
		total: total,
		active: total - degraded,
		rebuild: pct,
		finish_min: finish,
		members: members
	};
}

function storage_info() {
	let lines = split(trim(sh(`df -k ${DATA} 2>/dev/null`)), '\n');
	if (length(lines) < 2) return { mounted: false };
	let f = split(replace(lines[1], /\s+/g, ' '), ' ');
	return {
		mounted: index(lines[1], DATA) >= 0,
		total: int(f[1]) * 1024,
		used: int(f[2]) * 1024,
		free: int(f[3]) * 1024
	};
}

function display_name() {
	let c = cursor();
	let n = null;
	c.foreach('system', 'system', (s) => { if (n == null) n = s.description; });
	return (n && length(n)) ? n : read1('/proc/sys/kernel/hostname');
}

function refresh_names() {
	system('/usr/sbin/nas-names apply >/dev/null 2>&1');
}

function system_info() {
	let mem = readfile('/proc/meminfo') ?? '';
	let mt = match(mem, /MemTotal:\s+(\d+)/), ma = match(mem, /MemAvailable:\s+(\d+)/);
	// "used" as the free command computes it: total - free - buffers - cache - reclaimable slab
	let kb = (k) => { let m = match(mem, regexp(`(^|\n)${k}:\\s+(\\d+)`)); return m ? int(m[2]) : 0; };
	let mem_used = mt ? (kb('MemTotal') - kb('MemFree') - kb('Buffers') - kb('Cached') - kb('SReclaimable')) * 1024 : null;
	let rel = match(readfile('/etc/openwrt_release') ?? '', /DISTRIB_DESCRIPTION='([^']+)'/);
	let soc = read1('/sys/class/thermal/thermal_zone0/temp');
	let rpm = read1('/tmp/nas-fan.rpm');
	let ip = null;
	let lan = json(sh('ifstatus lan 2>/dev/null') || 'null');
	if (lan && length(lan['ipv4-address'])) ip = lan['ipv4-address'][0].address;

	return {
		hostname: read1('/proc/sys/kernel/hostname'),
		name: display_name(),
		model: read1('/tmp/sysinfo/model'),
		release: rel ? rel[1] : null,
		uptime: int(split(read1('/proc/uptime') ?? '0', ' ')[0]),
		load: split(read1('/proc/loadavg') ?? '', ' ')[0],
		mem_total: mt ? int(mt[1]) * 1024 : null,
		mem_avail: ma ? int(ma[1]) * 1024 : null,
		mem_used: mem_used,
		soc_temp: soc ? int(soc) / 1000 : null,
		fan_level: read1('/tmp/nas-fan.level'),
		fan_rpm: (rpm && int(rpm) > 0) ? int(rpm) : null,
		board_temp: match(read1('/tmp/nas-fan.board') ?? '', /^\d+$/) ? int(read1('/tmp/nas-fan.board')) : null,
		ip: ip,
		link: {
			up: read1('/sys/class/net/eth0/carrier') == '1',
			speed: int(read1('/sys/class/net/eth0/speed') ?? -1),
			duplex: read1('/sys/class/net/eth0/duplex')
		}
	};
}

function usb_info(disks) {
	let mounts = readfile('/proc/mounts') ?? '';
	let c = cursor();
	c.load('samba4');
	let out = [];
	for (let d in disks) {
		if (!d.usb) continue;
		let names = filter(lsdir(`/sys/block/${d.dev}`) ?? [], (p) => index(p, d.dev) == 0);
		if (!length(names)) names = [ d.dev ];
		let parts = [];
		for (let p in sort(names)) {
			let info = sh(`block info /dev/${p} 2>/dev/null`);
			let ty = match(info, / TYPE="([^"]*)"/), lb = match(info, / LABEL="([^"]*)"/);
			let m = match(mounts, regexp(`/dev/${p} (\\S+) (\\S+) (\\S+)`));
			let part = {
				dev: p,
				label: lb ? lb[1] : null,
				fstype: ty ? ty[1] : null,
				size: int(read1(`/sys/class/block/${p}/size`) ?? 0) * 512,
				mount: m ? m[1] : null,
				readonly: m ? (substr(m[3], 0, 3) == 'ro,' || m[3] == 'ro') : false,
				share: c.get('samba4', `usb_${p}`, 'name'),
				state: read1(`/tmp/nas-usb/${p}`)
			};
			if (part.mount) {
				let df = split(trim(sh(`df -k ${shq(part.mount)} 2>/dev/null`)), '\n');
				if (length(df) >= 2) {
					let f = split(replace(df[length(df) - 1], /\s+/g, ' '), ' ');
					part.total = int(f[1]) * 1024; part.used = int(f[2]) * 1024; part.free = int(f[3]) * 1024;
				}
			}
			if (part.fstype || part.mount) push(parts, part);
		}
		/* USB link: the deepest "<bus>-<port>" directory in the device path, e.g.
		 * ../usb5/5-1/5-1:1.0/host2/... -> /sys/bus/usb/devices/5-1/{speed,version} */
		let usbdev = null;
		for (let seg in split(readlink(`/sys/block/${d.dev}`) ?? '', '/'))
			if (match(seg, /^[0-9]+-[0-9.]+$/)) usbdev = seg;
		let speed = usbdev ? read1(`/sys/bus/usb/devices/${usbdev}/speed`) : null;   /* Mb/s: 480, 5000, ... */
		let version = usbdev ? read1(`/sys/bus/usb/devices/${usbdev}/version`) : null; /* what the drive supports */
		push(out, { dev: d.dev, model: d.model, size: d.size, parts: parts,
			link_mbps: speed != null ? +speed : null, usb_version: version != null ? +version : null });
	}
	return out;
}

/* ------------------------------------------------------------------- users */

function smb_users() {
	let set = {};
	for (let l in split(sh('pdbedit -L 2>/dev/null'), '\n')) {
		let m = match(l, /^([^:]+):/);
		if (m) set[m[1]] = true;
	}
	return set;
}

function passwd_entries() {
	let out = [];
	for (let l in split(readfile('/etc/passwd') ?? '', '\n')) {
		let f = split(l, ':');
		if (length(f) >= 7) push(out, { name: f[0], uid: int(f[2]), shell: f[6] });
	}
	return out;
}

function is_nas_user(e) {
	return e.uid >= 1000 && e.uid < 60000 && e.shell == '/bin/false';
}

function nas_users() {
	let smb = smb_users();
	let out = [];
	for (let e in passwd_entries())
		if (is_nas_user(e)) push(out, { name: e.name, uid: e.uid, samba: !!smb[e.name] });
	return out;
}

function valid_username(name) {
	return type(name) == 'string' && match(name, /^[a-z_][a-z0-9_-]{0,31}$/) &&
		index(RESERVED_USERS, name) < 0;
}

function valid_password(pw) {
	return type(pw) == 'string' && length(pw) >= 4 && length(pw) <= 128 &&
		index(pw, '\n') < 0 && index(pw, '\r') < 0;
}

function set_smb_password(name, pw) {
	let p = popen(`smbpasswd -s -a ${shq(name)} >/dev/null 2>&1`, 'w');
	if (!p) return false;
	p.write(pw + '\n' + pw + '\n');
	p.close();
	return !!smb_users()[name];
}

function remove_lines(path, name) {
	let content = readfile(path);
	if (content == null) return;
	let keep = [];
	for (let l in split(content, '\n'))
		if (length(l) && index(l, name + ':') != 0) push(keep, l);
	writefile(path, join('\n', keep) + '\n');
}

function strip_user_from_shares(name) {
	let c = cursor();
	c.load('samba4');
	c.foreach('samba4', 'sambashare', (s) => {
		for (let opt in [ 'users', 'read_list', 'write_list' ]) {
			if (!s[opt]) continue;
			let list = filter(split(s[opt], /[ ,]+/), (u) => length(u) && u != name);
			if (length(list)) c.set('samba4', s['.name'], opt, join(' ', list));
			else c.delete('samba4', s['.name'], opt);
		}
	});
	c.commit('samba4');
}

/* ------------------------------------------------------------------ shares */

function share_list() {
	let c = cursor();
	c.load('samba4');
	let out = [];
	c.foreach('samba4', 'sambashare', (s) => {
		if (s.nas_usb == '1') return;   /* USB drives: managed by nas-usb, shown on the overview */
		let users = filter(split(s.users ?? '', /[ ,]+/), (x) => length(x));
		let ro = filter(split(s.read_list ?? '', /[ ,]+/), (x) => length(x));
		let access = {};
		for (let u in users) access[u] = (index(ro, u) >= 0 || s.read_only == 'yes') ? 'ro' : 'rw';
		push(out, {
			id: s['.name'],
			name: s.name,
			path: s.path,
			access: access,
			guest: s.guest_ok == 'yes',
			timemachine: s.timemachine == '1',
			tm_cap: s.timemachine_maxsize ? int(s.timemachine_maxsize) : null,
			recycle: index(s.vfs_objects ?? '', 'recycle') >= 0,
			exists: !!stat(s.path ?? '')
		});
	});
	return out;
}

function folder_list() {
	let out = [];
	for (let d in (lsdir(DATA) ?? [])) {
		if (substr(d, 0, 1) == '.' || index(HIDDEN_DIRS, d) >= 0) continue;
		let st = stat(`${DATA}/${d}`);
		if (st && st.type == 'directory') push(out, d);
	}
	return sort(out, (a, b) => (lc(a) < lc(b)) ? -1 : 1);
}

function valid_share_name(n) {
	return type(n) == 'string' && match(n, /^[A-Za-z0-9][A-Za-z0-9_. -]{0,39}$/) &&
		!match(lc(n), /^(global|homes|printers|ipc\$)$/);
}

function valid_folder_name(n) {
	return type(n) == 'string' && match(n, /^[A-Za-z0-9][A-Za-z0-9_. -]{0,63}$/) && index(n, '..') < 0;
}

/* ------------------------------------------------------------------ methods */

function services_info() {
	let svc = json(sh('ubus call service list 2>/dev/null') || '{}') ?? {};
	let running = (name) => {
		for (let k, inst in (svc[name]?.instances ?? {}))
			if (inst.running) return true;
		return false;
	};
	let c = cursor();
	let tm = false, recycle = false;
	c.foreach('samba4', 'sambashare', (s) => {
		if (s.timemachine == '1') tm = true;
		if (index(s.vfs_objects ?? '', 'recycle') >= 0) recycle = true;
	});
	let idle = null;
	c.foreach('hd-idle', 'hd-idle', (s) => {
		if (s.enabled == '1') idle = (s.idle_time_interval ?? '') + ' ' + (s.idle_time_unit ?? 'minutes');
	});
	// idle power-off (nas-watch): unset means 48 hours, 0 means never
	let off_h = c.get('nas-alert', 'main', 'idle_poweroff_hours') ?? '48';
	let off_n = match(off_h, /^[0-9]+$/) ? +off_h : 0;
	let poweroff = off_n > 0 ? `${off_n} hours without use` : null;
	// Wake-on-LAN (armed by nas-poweroff at every power-off unless switched off)
	let wol = (c.get('nas-alert', 'main', 'wol') ?? '1') != '0';
	// recycle bin: days kept before nas-recycle-clean empties it (0 = never)
	let rd = c.get('nas-alert', 'main', 'recycle_days') ?? '30';
	let rdays = match(rd, /^[0-9]+$/) ? +rd : 30;
	let last = trim(split(readfile('/etc/nas-poweroff.last') ?? '', '\n')[0] ?? '');
	return [
		{ id: 'smb',  name: 'File sharing (SMB)', state: running('samba4') ? 'running' : 'stopped' },
		{ id: 'tm',   name: 'Time Machine',       state: !tm ? 'off' : (running('samba4') ? 'running' : 'stopped') },
		{ id: 'mdns', name: 'Mac discovery',      state: running('avahi-daemon') ? 'running' : 'stopped' },
		{ id: 'wsd',  name: 'Windows discovery',  state: running('wsdd2') ? 'running' : 'stopped' },
		{ id: 'fan',  name: 'Fan control',        state: running('nas-fan') ? 'auto' : 'stopped' },
		{ id: 'recycle', name: 'Recycle bin', state: recycle ? 'idle' : 'off', days: rdays,
		  text: recycle ? (rdays > 0 ? `Keeps ${rdays} days` : 'Keeps forever') : null },
		{ id: 'idle', name: 'Disk sleep',         state: idle ? 'idle' : 'off', detail: idle },
		{ id: 'poweroff', name: 'Idle power-off', state: poweroff ? 'idle' : 'off', detail: poweroff, hours: off_n },
		{ id: 'wol', name: 'Wake-on-LAN', state: wol ? 'idle' : 'off',
		  mac: trim(readfile('/sys/class/net/eth0/address') ?? ''), last: length(last) ? last : null }
	];
}

function net_counters(dev) {
	for (let l in split(readfile('/proc/net/dev') ?? '', '\n')) {
		let m = match(l, /^\s*([^:]+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
		if (m && m[1] == dev) return { rx: +m[2], tx: +m[3] };
	}
	return { rx: 0, tx: 0 };
}

/* ------------------------------------------------------------ cold storage */

const CS = '/tmp/nas-coldsync';
const CS_BIN = '/usr/sbin/nas-coldsync';

function kv_file(path) {
	let out = {};
	for (let l in split(readfile(path) ?? '', '\n')) {
		let i = index(l, '=');
		if (i > 0) out[substr(l, 0, i)] = substr(l, i + 1);
	}
	return out;
}

function num(v) {
	return (v != null && match(v, /^[0-9]+$/)) ? +v : null;
}

function cs_running() {
	let pid = read1(`${CS}/pid`);
	return !!(pid && match(pid, /^[0-9]+$/) && stat(`/proc/${pid}`));
}

function cs_targets() {
	/* writable USB mounts made by nas-usb under /mnt/usb */
	let out = [];
	for (let l in split(readfile('/proc/mounts') ?? '', '\n')) {
		let f = split(l, ' ');
		if (length(f) < 4 || index(f[1], '/mnt/usb/') != 0) continue;
		let dev = replace(f[0], '/dev/', '');
		if (index(readlink(`/sys/class/block/${dev}`) ?? '', '/usb') < 0) continue;
		let df = split(trim(sh(`df -k ${shq(f[1])} 2>/dev/null`)), '\n');
		let d = length(df) >= 2 ? split(replace(df[length(df) - 1], /\s+/g, ' '), ' ') : [];
		push(out, {
			mount: f[1],
			label: substr(f[1], 9),
			dev: dev,
			fstype: f[2],
			readonly: (f[3] == 'ro' || substr(f[3], 0, 3) == 'ro,'),
			total: length(d) > 3 ? int(d[1]) * 1024 : null,
			free: length(d) > 3 ? int(d[3]) * 1024 : null,
			has_backup: !!stat(`${f[1]}/NAS-Backup`)
		});
	}
	return out;
}

function cs_status() {
	let st = kv_file(`${CS}/status`);
	let jobf = split(trim(readfile(`${CS}/job`) ?? ''), '\n');
	let job = null;
	if (st.phase || st.started) {
		let p = split(trim(readfile(`${CS}/progress`) ?? ''), ' ');
		job = {
			phase: st.phase ?? 'checking',
			running: cs_running(),
			mode: jobf[0],
			mount: jobf[1],
			label: jobf[1] ? substr(jobf[1], 9) : null,
			folders: slice(jobf, 2),
			started: num(st.started),
			checking_since: num(st.checking_since),
			copy_since: num(st.copy_since),
			finished: num(st.finished),
			message: st.message ?? '',
			scanned: num(read1(`${CS}/scanned`)),
			plan_bytes: num(st.plan_bytes),
			plan_files: num(st.plan_files),
			plan_total: num(st.plan_total),
			plan_deletes: num(st.plan_deletes),
			bytes: length(p) == 3 ? num(p[0]) : null,
			files: length(p) == 3 ? num(p[1]) : null,
			rate: length(p) == 3 ? num(p[2]) : null,
			now: time()
		};
		/* a job that died without writing a result (power loss, kill -9) */
		if (!job.running && (job.phase == 'checking' || job.phase == 'copying')) {
			job.phase = 'failed';
			job.message = 'The copy stopped unexpectedly. Start it again: it continues where it left off.';
		}
	}
	let last = kv_file('/etc/nas-coldsync.last');
	if (last.result) {
		last.folders = filter(split(last.folders ?? '', '|'), (x) => length(x));
		for (let k in [ 'finished', 'started', 'copied', 'files', 'deleted' ]) last[k] = num(last[k]);
	} else last = null;

	return { job: job, last: last, targets: cs_targets(), folders: folder_list() };
}

const methods = {
	cold_status: {
		call: function() {
			return cs_status();
		}
	},

	cold_deletes: {
		call: function() {
			let all = filter(split(readfile(`${CS}/deletes`) ?? '', '\n'), (x) => length(x));
			return { count: length(all), list: slice(all, 0, 300) };
		}
	},

	cold_start: {
		args: { mode: 'mode', mount: 'mount', folders: [] },
		call: function(req) {
			let a = req.args;
			if (a.mode != 'copy' && a.mode != 'sync') return { error: 'Choose Copy or Sync.' };
			if (type(a.mount) != 'string' || !length(filter(cs_targets(), (t) => t.mount == a.mount && !t.readonly)))
				return { error: 'That USB drive is not connected or is read-only.' };
			if (type(a.folders) != 'array' || !length(a.folders)) return { error: 'Choose at least one folder.' };
			let known = folder_list();
			for (let f in a.folders)
				if (type(f) != 'string' || index(known, f) < 0) return { error: `Unknown folder: ${f}` };
			if (cs_running()) return { error: 'A copy is already running.' };
			let out = trim(sh(`${CS_BIN} start ${a.mode} ${shq(a.mount)} ${join(' ', map(a.folders, shq))} 2>&1`));
			return length(out) ? { error: out } : { ok: true };
		}
	},

	cold_confirm: {
		call: function() {
			let out = trim(sh(`${CS_BIN} confirm 2>&1`));
			return length(out) ? { error: out } : { ok: true };
		}
	},

	cold_cancel: {
		call: function() {
			sh(`${CS_BIN} cancel 2>&1`);
			return { ok: true };
		}
	},

	overview: {
		call: function() {
			let disks = [];
			for (let d in (lsdir('/sys/block') ?? []))
				if (match(d, /^sd[a-z]+$/)) push(disks, disk_info(d));
			return {
				system: system_info(),
				storage: storage_info(),
				raid: raid_info(),
				disks: disks,
				usb: usb_info(disks),
				services: services_info()
			};
		}
	},

	stats: {
		call: function() {
			let up = split(read1('/proc/uptime') ?? '0', ' ')[0];
			let soc = read1('/sys/class/thermal/thermal_zone0/temp');
			let n = net_counters('br-lan');
			return { t: +up, rx: n.rx, tx: n.tx, soc_temp: soc ? int(soc) / 1000 : null };
		}
	},

	users_list: {
		call: function() {
			return { users: nas_users() };
		}
	},

	user_add: {
		args: { name: 'name', password: 'password' },
		call: function(req) {
			let name = req.args.name, pw = req.args.password;
			if (!valid_username(name))
				return { error: 'Use lowercase letters, digits, _ or -, starting with a letter (max 32).' };
			if (!valid_password(pw))
				return { error: 'The password must be at least 4 characters.' };

			let entries = passwd_entries();
			let existing = filter(entries, (e) => e.name == name)[0];
			if (existing && !is_nas_user(existing))
				return { error: `"${name}" is a system account and can't be used.` };

			if (!existing) {
				let uid = 1000;
				for (let e in entries)
					if (e.uid >= uid && e.uid < 60000) uid = e.uid + 1;
				let pf = readfile('/etc/passwd') ?? '', sf = readfile('/etc/shadow') ?? '', gf = readfile('/etc/group') ?? '';
				writefile('/etc/passwd', pf + `${name}:x:${uid}:${uid}:NAS user:/var:/bin/false\n`);
				writefile('/etc/shadow', sf + `${name}:*:0:0:99999:7:::\n`);
				if (!match(gf, regexp(`(^|\\n)${name}:`)))
					writefile('/etc/group', gf + `${name}:x:${uid}:\n`);
			}

			if (!set_smb_password(name, pw))
				return { error: 'Could not set the Samba password.' };
			return { ok: true };
		}
	},

	user_passwd: {
		args: { name: 'name', password: 'password' },
		call: function(req) {
			let name = req.args.name, pw = req.args.password;
			let e = filter(passwd_entries(), (x) => x.name == name)[0];
			if (!e || !is_nas_user(e)) return { error: 'Unknown user.' };
			if (!valid_password(pw)) return { error: 'The password must be at least 4 characters.' };
			if (!set_smb_password(name, pw)) return { error: 'Could not set the password.' };
			return { ok: true };
		}
	},

	user_del: {
		args: { name: 'name' },
		call: function(req) {
			let name = req.args.name;
			let e = filter(passwd_entries(), (x) => x.name == name)[0];
			if (!e || !is_nas_user(e)) return { error: 'Unknown user.' };
			system(`smbpasswd -x ${shq(name)} >/dev/null 2>&1`);
			remove_lines('/etc/passwd', name);
			remove_lines('/etc/shadow', name);
			remove_lines('/etc/group', name);
			strip_user_from_shares(name);
			reload_samba();
			return { ok: true };
		}
	},

	shares_list: {
		call: function() {
			return { shares: share_list(), folders: folder_list(), users: nas_users(), base: DATA };
		}
	},

	share_save: {
		args: { id: 'id', name: 'name', folder: 'folder', create: false, access: {}, guest: false, timemachine: false, tm_cap: 0, recycle: true },
		call: function(req) {
			let a = req.args;
			if (!valid_share_name(a.name))
				return { error: 'Share names may use letters, digits, space, dot, _ and - (max 40).' };
			if (!valid_folder_name(a.folder))
				return { error: 'Please choose a valid folder.' };

			let path = `${DATA}/${a.folder}`;
			if (!stat(path)) {
				if (!a.create) return { error: 'That folder does not exist.' };
				if (!mkdir(path, 0o777)) return { error: 'Could not create the folder.' };
				system(`chmod 0777 ${shq(path)}`);
			}

			let c = cursor();
			c.load('samba4');
			let clash = false;
			c.foreach('samba4', 'sambashare', (s) => {
				if (s['.name'] != a.id && lc(s.name ?? '') == lc(a.name)) clash = true;
			});
			if (clash) return { error: `A share named "${a.name}" already exists.` };

			let known = {};
			for (let u in nas_users()) known[u.name] = true;
			let rw = [], ro = [];
			for (let u in keys(a.access ?? {})) {
				if (!known[u]) continue;
				if (a.access[u] == 'rw') push(rw, u);
				else if (a.access[u] == 'ro') push(ro, u);
			}

			let id = a.id;
			if (!id || !c.get('samba4', id)) id = c.add('samba4', 'sambashare');

			c.set('samba4', id, 'name', a.name);
			c.set('samba4', id, 'path', path);
			c.set('samba4', id, 'read_only', 'no');
			c.set('samba4', id, 'browseable', 'yes');
			c.set('samba4', id, 'force_root', '1');
			c.set('samba4', id, 'create_mask', '0666');
			c.set('samba4', id, 'dir_mask', '0777');
			c.set('samba4', id, 'guest_ok', a.guest ? 'yes' : 'no');

			let all = [ ...rw, ...ro ];
			if (length(all)) c.set('samba4', id, 'users', join(' ', all));
			else c.delete('samba4', id, 'users');
			if (length(ro)) c.set('samba4', id, 'read_list', join(' ', ro));
			else c.delete('samba4', id, 'read_list');
			c.delete('samba4', id, 'write_list');

			/* recycle bin: on unless switched off for this share; never on Time Machine shares
			 * (Time Machine deletes old backup bands constantly) */
			if (a.timemachine || a.recycle === false) c.delete('samba4', id, 'vfs_objects');
			else c.set('samba4', id, 'vfs_objects', 'recycle');

			if (a.timemachine) {
				c.set('samba4', id, 'timemachine', '1');
				if (int(a.tm_cap) > 0) c.set('samba4', id, 'timemachine_maxsize', '' + int(a.tm_cap));
				else c.delete('samba4', id, 'timemachine_maxsize');
			} else {
				c.delete('samba4', id, 'timemachine');
				c.delete('samba4', id, 'timemachine_maxsize');
			}

			c.commit('samba4');
			reload_samba();
			refresh_names();
			return { ok: true, id: id };
		}
	},

	share_delete: {
		args: { id: 'id' },
		call: function(req) {
			let c = cursor();
			c.load('samba4');
			if (c.get('samba4', req.args.id) != 'sambashare') return { error: 'Unknown share.' };
			c.delete('samba4', req.args.id);
			c.commit('samba4');
			reload_samba();
			refresh_names();
			return { ok: true };
		}
	},

	usb_eject: {
		args: { dev: 'dev' },
		call: function(req) {
			let dev = req.args.dev;
			if (type(dev) != 'string' || !match(dev, /^sd[a-z]+$/)) return { error: 'Unknown drive.' };
			if (index(readlink(`/sys/block/${dev}`) ?? '', '/usb') < 0) return { error: 'That is not a USB drive.' };
			for (let t in cs_targets())
				if (index(t.dev, dev) == 0 && system(`${CS_BIN} uses ${shq(t.mount)}`) == 0)
					return { error: 'A cold storage copy is using this drive. Cancel it on the Cold storage card first.' };
			let out = trim(sh(`/usr/sbin/nas-usb eject ${dev} 2>&1`));
			if (stat(`/sys/block/${dev}`) && length(out)) return { error: out };
			return { ok: true };
		}
	},

	names_set: {
		args: { name: 'name', hostname: 'hostname' },
		call: function(req) {
			let name = trim(req.args.name ?? ''), host = lc(trim(req.args.hostname ?? ''));
			if (!match(name, /^[A-Za-z0-9][A-Za-z0-9 '._()-]{0,39}$/))
				return { error: 'Use letters, digits, spaces and \' . _ - ( ) for the name (max 40).' };
			if (!match(host, /^[a-z0-9]([a-z0-9-]{0,13}[a-z0-9])?$/))
				return { error: 'The local name may use lowercase letters, digits and - (max 15, no - at the ends).' };
			system(`(sleep 1; /usr/sbin/nas-names set ${shq(name)} ${shq(host)}) >/dev/null 2>&1 &`);
			return { ok: true, hostname: host };
		}
	},

	// idle power-off: hours without use before nas-watch switches the NAS off (0 = never).
	// nas-watch reads the value every minute, so no restart is needed.
	idle_poweroff_set: {
		args: { hours: 0 },
		call: function(req) {
			let h = req.args.hours;
			if (type(h) != 'int' || h < 0 || h > 720)
				return { error: 'Choose between 1 and 720 hours, or Off.' };
			let c = cursor();
			c.load('nas-alert');
			if (!c.get('nas-alert', 'main')) return { error: 'The alert settings (/etc/config/nas-alert) are missing.' };
			c.set('nas-alert', 'main', 'idle_poweroff_hours', `${h}`);
			c.commit('nas-alert');
			return { ok: true, hours: h };
		}
	},

	// recycle bin: days deleted files are kept (0 = never emptied). Read by nas-recycle-clean.
	recycle_set: {
		args: { days: 0 },
		call: function(req) {
			let d = req.args.days;
			if (type(d) != 'int' || d < 0 || d > 365)
				return { error: 'Choose between 1 and 365 days, or Forever.' };
			let c = cursor();
			c.load('nas-alert');
			if (!c.get('nas-alert', 'main')) return { error: 'The alert settings (/etc/config/nas-alert) are missing.' };
			c.set('nas-alert', 'main', 'recycle_days', `${d}`);
			c.commit('nas-alert');
			return { ok: true, days: d };
		}
	},

	// Wake-on-LAN on/off: read by nas-poweroff at the next power-off
	wol_set: {
		args: { enabled: false },
		call: function(req) {
			if (type(req.args.enabled) != 'bool') return { error: 'Missing on/off value.' };
			let c = cursor();
			c.load('nas-alert');
			if (!c.get('nas-alert', 'main')) return { error: 'The alert settings (/etc/config/nas-alert) are missing.' };
			c.set('nas-alert', 'main', 'wol', req.args.enabled ? '1' : '0');
			c.commit('nas-alert');
			return { ok: true, enabled: req.args.enabled };
		}
	},

	power: {
		args: { action: 'action' },
		call: function(req) {
			let a = req.args.action;
			if (a == 'reboot')
				system('(sleep 2; /sbin/reboot) >/dev/null 2>&1 &');
			else if (a == 'poweroff')
				system('(sleep 2; /usr/sbin/nas-poweroff dashboard) >/dev/null 2>&1 &');   // real power-off via the MCU
			else
				return { error: 'Unknown action.' };
			return { ok: true };
		}
	}
};

return { 'luci.nas': methods };
