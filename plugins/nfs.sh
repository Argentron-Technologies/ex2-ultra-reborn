# plugins/nfs.sh: loaded by plugins.sh, never run on its own.
# about: NFS shares for Linux computers (and Macs), next to the SMB shares
#
# NFS lets Linux computers mount folders of the NAS like a local disk.
# NFS has no passwords: every computer you allow can read the folder, and with rw
# also change it. Like the rest of this project, it's meant for a trusted home network.
#
# Commands:
#   install                      install the NFS server (NFSv3). Nothing is shared yet.
#   add <folder> [rw|ro] [who]   share the NAS folder /mnt/data/<folder> over NFS.
#                                rw: read and write (default). ro: read-only.
#                                who: which computers may connect. Default: your whole
#                                home network. Or one address (192.168.1.20), or a
#                                network (192.168.1.0/24).
#   del <folder>                 stop sharing a folder over NFS
#   status                       shared folders and connected computers
#   uninstall                    stop sharing everything and remove the NFS server
#
# Examples:
#   ./plugins.sh nfs install
#   ./plugins.sh nfs add Media
#   ./plugins.sh nfs add "Family Photos" ro
#
# Then, using the NAS's IP address:
#   Linux:  sudo mount -t nfs -o vers=3 <NAS IP>:/mnt/data/Media /mnt/media
#   Mac:    Finder > Go > Connect to Server > nfs://<NAS IP>/mnt/data/Media
#
# Once installed, the dashboard does the same: an NFS switch on each share (Shares page),
# and the NFS server on or off (Overview > Services).
# Time Machine folders can't be shared over NFS (changes outside Time Machine break
# its backups). Files written over NFS belong to root, like files written over SMB.

NFS_PKG=nfs-kernel-server     # the NFSv3 server (nfs-kernel-server-v4 drops NFSv3, which Macs use)
# The share list itself is kept by /usr/sbin/nas-nfs on the NAS (the export options are
# explained there), so this script and the dashboard always agree.

nfs_need() {
	on '[ -x /usr/sbin/nas-nfs ] && [ "$(/usr/sbin/nas-nfs state)" != missing ]' || \
		die "the NFS server isn't installed: run $PRUN nfs install first"
}

# the same rule as folder names on the dashboard (valid_folder_name in luci.nas)
nfs_folder_ok() {
	case "$1" in *..*|*/*|*"
"*) return 1 ;; esac
	printf '%s\n' "$1" | grep -qxE '[A-Za-z0-9][A-Za-z0-9_. -]{0,63}'
}

# the folder's current NFS line from nas-nfs list: "<folder> <who> <rw|ro>" (tab-separated)
nfs_line() { on "/usr/sbin/nas-nfs list | awk -F'\t' -v f='$1' '\$1 == f { print; exit }'" || true; }

nfs_ip() { on 'ip -4 -o addr show br-lan | awk "{ split(\$4, a, \"/\"); print a[1]; exit }"'; }

nfs_install() {
	say "copying nas-nfs (keeps the NFS share list for this script and the dashboard)"
	(cd "$HERE/nas-system/root" && tar -X "$EXCL" -cf - usr/sbin/nas-nfs) | on 'tar -x -o -f - -C / &&
		chown root:root /usr/sbin/nas-nfs && chmod 755 /usr/sbin/nas-nfs'
	say "installing the NFS server ($NFS_PKG)"
	on "apk update && apk add $NFS_PKG"
	say "starting it"
	on 'set -e
		touch /etc/exports
		# keep the helper and the share list across OpenWrt upgrades (Attended Sysupgrade keeps the package)
		for f in /usr/sbin/nas-nfs /etc/exports; do grep -qxF $f /etc/sysupgrade.conf || echo $f >> /etc/sysupgrade.conf; done
		/usr/sbin/nas-nfs enable
		touch /lib/apk/db/installed     # browsers reload the dashboard, which now shows the NFS controls'
	echo "done. Nothing is shared yet. Share a folder with: $PRUN nfs add <folder>"
	echo "or on the dashboard: Shares > Edit > NFS. Switch the server off or on under Overview > Services."
}

nfs_add() {
	folder=$1; mode=${2:-rw}; who=$3
	[ -n "$folder" ] || die "which folder? $PRUN nfs add <folder> [rw|ro] [who]"
	nfs_folder_ok "$folder" || die "'$folder' isn't a folder name the NAS uses (letters, digits, spaces and . _ -)"
	case "$mode" in rw|ro) ;; *) die "use rw or ro, not '$mode'" ;; esac
	printf '%s\n' "$who" | grep -qxE '[0-9./]*' || die "who must be an IPv4 address or network, like 192.168.1.20 or 192.168.1.0/24"
	nfs_need
	# who will see it: as given, else what the folder had, else the home network (nas-nfs decides the same way)
	shown=$who
	[ -n "$shown" ] || shown=$(nfs_line "$folder" | cut -f2)
	[ -n "$shown" ] || shown=$(on '/usr/sbin/nas-nfs lan' || true)
	if [ "$mode" = rw ]; then can="read and change"; else can="read"; fi
	echo "Every computer in ${shown:-your home network} will be able to $can all files in '$folder' over NFS, without a password."
	ask "Share it?" || { echo cancelled; exit 1; }
	on "/usr/sbin/nas-nfs add '$folder' $mode '$who'"
	[ "$(on '/usr/sbin/nas-nfs state')" = running ] || \
		echo "Note: the NFS server is switched off (Overview > Services). The folder is shared once you switch it on."
	ip=$(nfs_ip || true)
	echo "shared. Connect with:"
	echo "  Linux:  sudo mount -t nfs -o vers=3 ${ip:-<NAS IP>}:'/mnt/data/$folder' /mnt/<somewhere>"
	echo "  Mac:    Finder > Go > Connect to Server > nfs://${ip:-<NAS IP>}/mnt/data/$(printf '%s' "$folder" | sed 's/ /%20/g')"
}

nfs_del() {
	folder=$1
	[ -n "$folder" ] || die "which folder? $PRUN nfs del <folder>"
	nfs_folder_ok "$folder" || die "'$folder' isn't a folder name the NAS uses"
	nfs_need
	if [ -n "$(nfs_line "$folder")" ]; then
		on "/usr/sbin/nas-nfs del '$folder'"
		echo "stopped sharing /mnt/data/$folder over NFS (the folder and its files are untouched)"
	else
		echo "/mnt/data/$folder isn't shared over NFS. Nothing changed."
	fi
}

nfs_status() {
	on '[ -x /usr/sbin/nas-nfs ] && /usr/sbin/nas-nfs status || echo "NFS server: not installed"'
}

nfs_uninstall() {
	nfs_need
	ask "Stop sharing every folder over NFS and remove the NFS server? (No files are deleted.)" || { echo cancelled; exit 1; }
	# touch: browsers reload the dashboard, which hides the NFS controls again
	on '/usr/sbin/nas-nfs remove && touch /lib/apk/db/installed'
}

plugin_main() {
	cmd=$1; [ $# -gt 0 ] && shift
	case "$cmd" in
		install)   nfs_install ;;
		add)       nfs_add "$@" ;;
		del)       nfs_del "$@" ;;
		status)    nfs_status ;;
		uninstall) nfs_uninstall ;;
		*)         plugin_help nfs; exit 1 ;;
	esac
}
