#!/bin/sh
# setup.sh: turn a WD My Cloud EX2 Ultra that already runs OpenWrt into a quiet,
# simple file server (SMB shares + Time Machine) with the "NAS OS" dashboard.
#
# Run it from a Mac or Linux PC on the same network. Steps, in order:
#
#   ./setup.sh check      read-only: is this an EX2 Ultra on OpenWrt? what disks and RAID?
#   ./setup.sh packages   install the packages this setup needs (NAS needs internet)
#   ./setup.sh data       use the existing WD data mirror (RAID 1) as /mnt/data. Never formats.
#   ./setup.sh install    copy scripts, dashboard and theme; set up names, fan, alerts, disk sleep
#   ./setup.sh alerts     optional: e-mail alerts (asks for SMTP details)
#   ./setup.sh update     later: re-copy scripts, dashboard and theme only
#
#   NAS=root@192.168.1.50 ./setup.sh check      (default: root@nas.local, or root@openwrt.local)
#
# Nothing here writes to the disks' data, partitions or RAID metadata.

set -e
HERE=$(cd "$(dirname "$0")" && pwd)
export COPYFILE_DISABLE=1      # no macOS ._* files inside the tarballs
NAS=${NAS:-}

PACKAGES="block-mount e2fsprogs kmod-md-raid1 hdparm smartmontools kmod-hwmon-drivetemp
coreutils-stty ethtool mdio-tools kmod-mdio-netlink samba4-server luci-app-samba4 wsdd2
avahi-dbus-daemon hd-idle luci-app-hd-idle msmtp ca-bundle kmod-fs-ext4 kmod-fs-vfat kmod-fs-exfat
kmod-fs-ntfs3 kmod-nls-utf8 kmod-nls-cp437 kmod-nls-iso8859-1 kmod-usb-storage-uas rpcd-mod-ucode
luci-app-attendedsysupgrade owut rsync"

SYSTEM_FILES="usr/sbin/nas-fan usr/sbin/nas-alert usr/sbin/nas-watch usr/sbin/nas-usb usr/sbin/nas-names
usr/sbin/nas-recycle-clean usr/sbin/nas-coldsync usr/sbin/nas-poweroff
etc/init.d/nas-fan etc/init.d/nas-watch etc/init.d/nas-datamount etc/init.d/nas-usb etc/init.d/nas-poweroff
etc/hotplug.d/block/30-nas-usb"

# kept across OpenWrt upgrades (added to /etc/sysupgrade.conf)
KEEP="/usr/sbin/nas-fan /usr/sbin/nas-alert /usr/sbin/nas-watch /usr/sbin/nas-usb /usr/sbin/nas-names
/usr/sbin/nas-recycle-clean /usr/sbin/nas-coldsync /usr/sbin/nas-poweroff
/etc/init.d/nas-fan /etc/init.d/nas-watch /etc/init.d/nas-datamount /etc/init.d/nas-usb /etc/init.d/nas-poweroff
/etc/rc.d/S15nas-fan /etc/rc.d/K90nas-fan /etc/rc.d/S99nas-watch /etc/rc.d/K10nas-watch /etc/rc.d/S14nas-datamount
/etc/rc.d/S97nas-usb /etc/rc.d/S99nas-poweroff /etc/rc.d/K99nas-poweroff
/etc/hotplug.d/block/30-nas-usb /etc/crontabs/root /etc/samba/smb.conf.template /etc/avahi/services/nas.service
/etc/nas-alert.pass /etc/nas-watch.clean /etc/nas-coldsync.last /etc/nas-poweroff.last
/www/luci-static/nasos/ /www/luci-static/resources/menu-nasos.js /usr/share/ucode/luci/template/themes/nasos/
/www/luci-static/resources/nas/ /www/luci-static/resources/view/nas/ /usr/share/rpcd/ucode/luci.nas
/usr/share/rpcd/acl.d/luci-app-nas.json /usr/share/luci/menu.d/luci-app-nas.json"

say()  { printf '\n== %s\n' "$*"; }
die()  { trap - EXIT; printf 'STOP: %s\n' "$*" >&2; exit 1; }
ask()  { printf '%s [y/N] ' "$1"; read -r a < /dev/tty; [ "$a" = y ] || [ "$a" = Y ]; }
on()   { ssh -o ConnectTimeout=8 "$NAS" "$@"; }
trap 'rc=$?; [ $rc -eq 0 ] || printf "\nSTOP: a step failed (exit %s). Nothing after it was done; it is safe to fix the cause and run the same command again.\n" "$rc" >&2' EXIT

find_nas() {
	if [ -n "$NAS" ]; then
		ssh -o ConnectTimeout=8 -o BatchMode=yes "$NAS" true 2>/dev/null || \
			die "can't connect to $NAS over SSH. Check the address, and add your key first: ssh-copy-id $NAS"
		return
	fi
	for h in root@nas.local root@openwrt.local; do
		ssh -o ConnectTimeout=5 -o BatchMode=yes "$h" true 2>/dev/null && { NAS=$h; return; }
	done
	die "can't reach the NAS. Run with NAS=root@<its IP> ./setup.sh $1 (and add your SSH key: ssh-copy-id root@<IP>)"
}

# Only ever touch a WD My Cloud EX2 Ultra running OpenWrt. Every check must pass:
# the fan, LED and power code talks to this model's microcontroller, and other WD
# models (Mirror Gen2, EX2100, EX4100, PR2100, ...) use different hardware.
guard() {
	id=$(on '
		echo "board=$(cat /tmp/sysinfo/board_name 2>/dev/null)"
		echo "compat=$( { tr "\0" " " < /proc/device-tree/compatible; } 2>/dev/null)"
		echo "model=$( { tr -d "\0" < /proc/device-tree/model; } 2>/dev/null)"
		. /etc/openwrt_release 2>/dev/null; echo "target=$DISTRIB_TARGET"
		echo "mcu=$([ -c /dev/ttyS1 ] && echo yes)"
		echo "apk=$(command -v apk >/dev/null && echo yes)"')
	val() { printf '%s\n' "$id" | sed -n "s/^$1=//p"; }
	bad=""
	[ "$(val board)" = "wd,cloud-ex2-ultra" ] || bad="$bad\n  board name is '$(val board)', expected 'wd,cloud-ex2-ultra'"
	c=" $(val compat) "
	case "$c" in *" wd,cloud-ex2-ultra "*) ;; *) c="";; esac
	case "$c" in *" marvell,armada385 "*) ;; *) c="";; esac
	[ -n "$c" ] || bad="$bad\n  device tree is '$(val compat)', expected it to include 'wd,cloud-ex2-ultra' and 'marvell,armada385'"
	[ "$(val model)" = "WD MyCloud Ex2 Ultra" ] || bad="$bad\n  model is '$(val model)', expected 'WD MyCloud Ex2 Ultra'"
	[ "$(val target)" = "mvebu/cortexa9" ] || bad="$bad\n  OpenWrt target is '$(val target)', expected 'mvebu/cortexa9'"
	[ "$(val mcu)" = yes ] || bad="$bad\n  no /dev/ttyS1 (the fan and power microcontroller)"
	if [ -n "$bad" ]; then
		trap - EXIT
		printf 'STOP: %s is not a WD My Cloud EX2 Ultra running OpenWrt:%b\nThese scripts are only for that model. Nothing was changed.\n' "$NAS" "$bad" >&2
		exit 1
	fi
	[ "$(val apk)" = yes ] || die "this setup expects OpenWrt 25.12 or newer (apk package manager)."
}

cmd_check() {
	say "NAS: $NAS"
	on 'set +e
		. /etc/openwrt_release; echo "OpenWrt:   $DISTRIB_DESCRIPTION"
		echo "Model:     $(cat /tmp/sysinfo/model)"
		echo "Address:   $(ip -4 -o addr show br-lan 2>/dev/null | awk "{print \$4}")   MAC $(cat /sys/class/net/eth0/address)"
		echo "Flash free: $(df -h /overlay | awk "NR==2 {print \$4}")"
		echo; echo "Disks:"
		for d in /sys/block/sd?; do n=${d##*/}
			s=$(( $(cat $d/size) / 2097152 ))
			echo "  $n  ${s} GB  $(cat $d/device/model 2>/dev/null)  $(readlink -f $d | grep -q /usb && echo USB || echo bay)"
		done
		echo; echo "RAID arrays found on the disks (read-only scan):"
		if command -v mdadm >/dev/null; then mdadm --examine --scan 2>/dev/null | sed "s/^/  /"; else echo "  (mdadm not installed yet: run ./setup.sh packages)"; fi
		echo; echo "Running arrays:"; grep ^md /proc/mdstat 2>/dev/null | sed "s/^/  /" | grep . || echo "  none"
		echo; echo "Mounted disk partitions:"; grep -E "^/dev/(sd|md)" /proc/mounts | sed "s/^/  /" | grep . || echo "  none"'
}

cmd_packages() {
	say "installing packages (a few minutes)"
	on "apk update && apk add $(echo $PACKAGES)"
	# mdadm: NOT with its install scripts. On this NAS they start mdadm --assemble --scan over
	# every block device, including the raw NAND flash; the OpenWrt wiki reports two reboots and
	# 0-byte files from that. So: install with --no-scripts, limit mdadm to the SATA disks first,
	# and only enable it later (./setup.sh data).
	say "installing mdadm (without its install scripts, see OpenWrt wiki)"
	on 'set -e
		apk add --no-scripts mdadm
		touch /etc/config/mdadm
		uci -q get mdadm.@mdadm[0] >/dev/null || uci add mdadm mdadm >/dev/null
		uci -q delete mdadm.@mdadm[0].devices || true
		uci add_list mdadm.@mdadm[0].devices="/dev/sd*"
		uci commit mdadm'
	# Avahi can't register on D-Bus if it was installed after dbus started: reload both
	on 'kill -HUP $(pidof dbus-daemon) 2>/dev/null; /etc/init.d/avahi-daemon restart 2>/dev/null; true'
	echo "done"
}

cmd_data() {
	say "looking for the data mirror (read-only)"
	on 'command -v mdadm >/dev/null' || die "mdadm missing: run ./setup.sh packages first"
	# one line per array: "ARRAY ... level=raid1 ... UUID=... devices=/dev/sda2,/dev/sdb2"
	all=$(on 'mdadm --examine --scan --verbose 2>/dev/null' | awk '/^ARRAY/ {if (l) print l; l=$0; next} {l=l " " $1} END {if (l) print l}')
	echo "${all:-  (no RAID metadata on any disk)}"
	# WD's data volume is RAID 1 on partition 2 of the disks (partition 1 is WD's swap)
	arrays=$(printf '%s\n' "$all" | grep 'level=raid1' | grep -E 'devices=/dev/sd[a-z]2(,/dev/sd[a-z]2)*$' || true)
	n=$(printf '%s\n' "$arrays" | grep -c UUID= || true)
	[ "$n" -ge 1 ] || die "no RAID 1 data mirror (partition 2) found. Create one in the WD dashboard ('RAID 1') before installing OpenWrt; this script never creates or formats arrays."
	echo; echo "Data mirror:"; printf '%s\n' "$arrays"
	if [ "$n" -gt 1 ]; then
		echo "Several candidates found."
		printf 'Paste the UUID to use: '; read -r uuid < /dev/tty
	else
		uuid=$(printf '%s\n' "$arrays" | sed -n 's/.*UUID=\([0-9a-f:]*\).*/\1/p')
	fi
	echo "$uuid" | grep -qE '^[0-9a-f]{8}(:[0-9a-f]{8}){3}$' || die "not a valid array UUID: $uuid"
	echo
	echo "This sets the NAS to assemble array $uuid as /dev/md1 and mount it at /mnt/data (ext4)."
	echo "It only changes /etc/config/mdadm and /etc/config/fstab (backups: *.bak-setup). No disk writes."
	ask "Continue?" || { echo cancelled; exit 1; }
	on "set -e
		[ -f /etc/config/mdadm.bak-setup ] || cp /etc/config/mdadm /etc/config/mdadm.bak-setup 2>/dev/null || true
		[ -f /etc/config/fstab.bak-setup ] || cp /etc/config/fstab /etc/config/fstab.bak-setup 2>/dev/null || true
		# mdadm: scan all disks, assemble the mirror as md1
		touch /etc/config/mdadm
		while uci -q delete mdadm.@array[0]; do :; done
		uci -q get mdadm.@mdadm[0] >/dev/null || uci add mdadm mdadm >/dev/null
		uci set mdadm.@mdadm[0].email=root
		uci -q delete mdadm.@mdadm[0].devices || true
		uci add_list mdadm.@mdadm[0].devices='/dev/sd*'
		uci set mdadm.data=array
		uci set mdadm.data.uuid='$uuid'
		uci set mdadm.data.device=/dev/md1
		uci commit mdadm
		# fstab: ONLY /dev/md1. anon_mount=0 so nothing mounts a single RAID member
		# (WD's superblock 1.0 makes the ext4 volume visible on each disk; mounting
		# one directly silently splits the mirror)
		touch /etc/config/fstab
		uci -q get fstab.@global[0] >/dev/null || uci add fstab global >/dev/null
		# drop old mounts of the data disks only (keeps e.g. the system's own /overlay entry)
		for sec in \$(uci -X -q show fstab | sed -n 's/^fstab\.\([^.=]*\)=mount\$/\1/p'); do
			t=\$(uci -q get fstab.\$sec.target || true); d=\$(uci -q get fstab.\$sec.device || true)
			case \"\$t \$d\" in /mnt/*|*/dev/sd*|*/dev/md*) uci delete fstab.\$sec ;; esac
		done
		uci set fstab.@global[0].anon_mount=0
		uci set fstab.@global[0].auto_mount=1
		uci set fstab.data=mount
		uci set fstab.data.target=/mnt/data
		uci set fstab.data.device=/dev/md1
		uci set fstab.data.fstype=ext4
		uci set fstab.data.enabled=1
		uci commit fstab
		/etc/init.d/mdadm enable"
	echo "saved. Next: ./setup.sh install, then reboot the NAS once."
}

cmd_code() {
	say "system scripts"
	(cd "$HERE/nas-system/root" && tar cf - $SYSTEM_FILES) | on 'tar xf - -C / &&
		chmod 755 /usr/sbin/nas-* /etc/init.d/nas-* &&
		for s in nas-datamount nas-fan nas-watch nas-usb nas-poweroff; do /etc/init.d/$s enable; done'
	on '[ -f /etc/config/nas-alert ]' || (cd "$HERE/nas-system/root" && tar cf - etc/config/nas-alert) | on 'tar xf - -C /'

	say "dashboard (luci-app-nas)"
	(cd "$HERE/luci-app-nas/htdocs/luci-static/resources" && tar cf - nas view/nas) | on 'tar xf - -C /www/luci-static/resources'
	(cd "$HERE/luci-app-nas/root" && tar cf - usr) | on 'tar xf - -C /'

	say "theme (luci-theme-nasos)"
	(cd "$HERE/luci-theme-nasos/htdocs/luci-static" && tar cf - nasos resources/menu-nasos.js) | on 'tar xf - -C /www/luci-static'
	(cd "$HERE/luci-theme-nasos/ucode/template" && tar cf - themes/nasos) | on 'mkdir -p /usr/share/ucode/luci/template && tar xf - -C /usr/share/ucode/luci/template'
	(cd "$HERE/luci-theme-nasos/root" && tar cf - etc) | on 'tar xf - -C / && sh /etc/uci-defaults/30_luci-theme-nasos && rm -f /etc/uci-defaults/30_luci-theme-nasos'
}

cmd_restart() {
	on '/etc/init.d/rpcd reload
		/etc/init.d/nas-fan restart 2>/dev/null; /etc/init.d/nas-watch restart 2>/dev/null
		/usr/sbin/nas-names apply
		rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
		touch /lib/apk/db/installed     # bumps the ?v= cache version, so browsers load the new files'
}

cmd_install() {
	on 'command -v smbd >/dev/null && command -v mdadm >/dev/null' || die "packages missing: run ./setup.sh packages first"
	printf 'Local name for the NAS (becomes <name>.local) [nas]: '; read -r host < /dev/tty; host=${host:-nas}
	echo "$host" | grep -qE '^[a-z0-9]([a-z0-9-]{0,13}[a-z0-9])?$' || die "use 1-15 lowercase letters, digits or '-'"
	printf 'Display name shown in Finder and on the dashboard [My NAS]: '; read -r name < /dev/tty; name=${name:-My NAS}

	cmd_code

	say "system settings"
	(cd "$HERE/nas-system/root" && tar cf - etc/samba/smb.conf.template) | on 'mkdir -p /tmp/nas-setup && tar xf - -C /tmp/nas-setup'
	on "set -e
		# names and time
		uci set system.@system[0].hostname='$host'
		uci set system.@system[0].description='$(printf %s "$name" | sed "s/'/'\\\\''/g")'
		uci commit system
		# no public IPv6 address: the NAS stays unreachable from the internet.
		# (link-local IPv6 remains, which keeps .local lookups fast on Macs)
		uci -q get network.lan6 >/dev/null && { uci set network.lan6.disabled=1; uci commit network; } || true

		# Samba: our template (recycle bin, Mac-friendly, own Bonjour record, listens on IPv4+IPv6)
		[ -f /etc/samba/smb.conf.template.orig ] || cp /etc/samba/smb.conf.template /etc/samba/smb.conf.template.orig
		cp /tmp/nas-setup/etc/samba/smb.conf.template /etc/samba/smb.conf.template
		uci set samba4.@samba[0].macos=1
		uci commit samba4

		# disk sleep after 10 min for every internal disk
		while uci -q delete hd-idle.@hd-idle[0]; do :; done
		for d in /sys/block/sd?; do readlink -f \$d | grep -q /usb && continue
			s=\$(uci add hd-idle hd-idle); n=\${d##*/}
			uci set hd-idle.\$s.disk=\$n; uci set hd-idle.\$s.enabled=1
			uci set hd-idle.\$s.idle_time_interval=10; uci set hd-idle.\$s.idle_time_unit=minutes
		done
		uci commit hd-idle; /etc/init.d/hd-idle enable

		# cron: monthly RAID check, weekly recycle-bin cleanup
		touch /etc/crontabs/root
		grep -q 'md1/md/sync_action' /etc/crontabs/root || cat >> /etc/crontabs/root <<'CR'
# monthly RAID data check: 1st of the month, 03:00 (hours; fan runs full speed meanwhile)
0 3 1 * * [ \"\$(cat /sys/block/md1/md/sync_action)\" = idle ] && echo check > /sys/block/md1/md/sync_action
CR
		grep -q nas-recycle-clean /etc/crontabs/root || cat >> /etc/crontabs/root <<'CR'
# empty recycle bins: files deleted more than 30 days ago (Sunday 04:30)
30 4 * * 0 /usr/sbin/nas-recycle-clean 30
CR
		/etc/init.d/cron enable

		# keep everything across OpenWrt upgrades
		for f in $(echo $KEEP); do grep -qxF \"\$f\" /etc/sysupgrade.conf || echo \"\$f\" >> /etc/sysupgrade.conf; done
		# safety net: re-enable fan control if an upgrade dropped its start link
		grep -q nas-fan /etc/rc.local || sed -i '/^exit 0/i [ -e /etc/rc.d/S15nas-fan ] || { /etc/init.d/nas-fan enable; /etc/init.d/nas-fan start; }' /etc/rc.local
		# wsdd2 (Windows network discovery) gives up if Samba isn't up yet at boot: retry once
		grep -q wsdd2 /etc/rc.local || sed -i '/^exit 0/i (sleep 30; /etc/init.d/wsdd2 running || /etc/init.d/wsdd2 restart) >/dev/null 2>&1 &' /etc/rc.local
		rm -rf /tmp/nas-setup"

	cmd_restart
	echo
	echo "Done. Reboot the NAS once:  ssh $NAS reboot"
	echo "Then open http://$host.local, sign in as root, set your time zone (System), and create users and shares on the NAS pages."
}

cmd_alerts() {
	cur() { on "uci -q get nas-alert.main.$1" 2>/dev/null; }
	printf 'Send alerts to [%s]: ' "$(cur to)"; read -r to < /dev/tty; to=${to:-$(cur to)}
	printf 'SMTP server [%s]: ' "$(cur smtp_host)"; read -r hostn < /dev/tty; hostn=${hostn:-$(cur smtp_host)}
	printf 'SMTP port (STARTTLS) [%s]: ' "$(cur smtp_port)"; read -r port < /dev/tty; port=${port:-$(cur smtp_port)}
	printf 'SMTP user [%s]: ' "$(cur smtp_user)"; read -r user < /dev/tty; user=${user:-$(cur smtp_user)}
	printf 'From address [%s]: ' "$user"; read -r from < /dev/tty; from=${from:-$user}
	printf 'SMTP password (not shown): '; stty -echo < /dev/tty; read -r pw < /dev/tty; stty echo < /dev/tty; echo
	on "uci set nas-alert.main.to='$to'; uci set nas-alert.main.smtp_host='$hostn'; uci set nas-alert.main.smtp_port='$port'
		uci set nas-alert.main.smtp_user='$user'; uci set nas-alert.main.from='$from'; uci set nas-alert.main.enabled=1
		uci commit nas-alert"
	# password goes over SSH stdin: never on a command line, never in this repo
	printf '%s\n' "$pw" | on 'umask 077; cat > /etc/nas-alert.pass'
	on '/usr/sbin/nas-alert test'
}

case "$1" in
	check|packages|data|install|alerts|update) ;;
	*) sed -n '2,17p' "$0"; exit 1 ;;
esac
find_nas "$1"
guard
case "$1" in
	check)    cmd_check ;;
	packages) cmd_packages ;;
	data)     cmd_data ;;
	install)  cmd_install ;;
	alerts)   cmd_alerts ;;
	update)   cmd_code; cmd_restart; echo "done: reload the dashboard" ;;
esac
