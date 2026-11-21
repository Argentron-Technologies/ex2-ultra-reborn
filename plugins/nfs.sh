# plugins/nfs.sh: loaded by plugins.sh, never run on its own.
# about: NFS shares for Linux computers (and Macs), next to the SMB shares
#
# NFS lets Linux computers mount folders of the NAS like a local disk.
# NFS has no passwords: each folder lists the computers (by IP address) that may connect,
# each read-write or read-only. Like the rest of this project, it's meant for a trusted
# home network.
#
# Commands:
#   install                        install the NFS server (NFSv3). Nothing is shared yet.
#   computer-add <name> <ip>       name a computer, e.g. "Linux PC" 192.168.1.20
#   computer-del <name|ip>         remove it (also from every folder it was allowed on)
#   add <folder> [rw|ro] [who]     let a computer use the NAS folder /mnt/data/<folder>.
#                                  rw: read and write (default). ro: read-only.
#                                  who: a computer's name, an IP address, or a network
#                                  (192.168.1.0/24). Default: your whole home network.
#                                  Run it once per computer; each keeps its own access.
#   del <folder> [who]             stop sharing a folder, or only with that computer
#   status                         computers, shared folders, connected computers
#   uninstall                      stop sharing everything and remove the NFS server
#
# Examples:
#   ./plugins.sh nfs install
#   ./plugins.sh nfs computer-add "Linux PC" 192.168.1.20
#   ./plugins.sh nfs add Media rw "Linux PC"
#   ./plugins.sh nfs add "Family Photos" ro
#
# Then, using the NAS's IP address:
#   Linux:  sudo mount -t nfs -o vers=3 <NAS IP>:/mnt/data/Media /mnt/media
#   Mac:    Finder > Go > Connect to Server > nfs://<NAS IP>/mnt/data/Media
#
# Once installed, the dashboard has an NFS page (next to Shares) that does all of this:
# the NFS server on/off, the computers, and the NFS shares. Any folder can be an NFS share,
# also one that is an SMB share; both reach the same files.
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

# the folder's current NFS lines from nas-nfs list: "<folder> <who> <rw|ro>" (tab-separated)
nfs_line() { on "/usr/sbin/nas-nfs list | awk -F'\t' -v f='$1' '\$1 == f'" || true; }

# names and addresses: no quote characters (they're passed to the NAS in single quotes)
nfs_arg_ok() { case "$1" in *"'"*|*'"'*|*'\'*|*'$'*|*'`'*) return 1 ;; esac; }

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
		# the dashboard shows the NFS page now: new menu, and browsers load the new files
		rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
		touch /lib/apk/db/installed'
	echo "done. Nothing is shared yet. Open the dashboard's NFS page (reload it first),"
	echo "or share a folder from here: $PRUN nfs add <folder>"
}

nfs_add() {
	folder=$1; mode=${2:-rw}; who=$3
	[ -n "$folder" ] || die "which folder? $PRUN nfs add <folder> [rw|ro] [who]"
	nfs_folder_ok "$folder" || die "'$folder' isn't a folder name the NAS uses (letters, digits, spaces and . _ -)"
	case "$mode" in rw|ro) ;; *) die "use rw or ro, not '$mode'" ;; esac
	nfs_arg_ok "$who" || die "who must be a computer's name, an IP address or a network, like 192.168.1.20 or 192.168.1.0/24"
	nfs_need
	# who: as given, else the home network (nas-nfs decides the same way)
	shown=$who
	[ -n "$shown" ] || shown="every computer in $(on '/usr/sbin/nas-nfs lan' || echo 'your home network')"
	if [ "$mode" = rw ]; then can="read and change"; else can="read"; fi
	echo "$shown will be able to $can all files in '$folder' over NFS, without a password."
	ask "Share it?" || { echo cancelled; exit 1; }
	on "/usr/sbin/nas-nfs add '$folder' $mode '$who'"
	[ "$(on '/usr/sbin/nas-nfs state')" = running ] || \
		echo "Note: the NFS server is switched off (dashboard: NFS page). The folder is shared once you switch it on."
	ip=$(nfs_ip || true)
	echo "shared. Connect with:"
	echo "  Linux:  sudo mount -t nfs -o vers=3 ${ip:-<NAS IP>}:'/mnt/data/$folder' /mnt/<somewhere>"
	echo "  Mac:    Finder > Go > Connect to Server > nfs://${ip:-<NAS IP>}/mnt/data/$(printf '%s' "$folder" | sed 's/ /%20/g')"
}

nfs_del() {
	folder=$1; who=$2
	[ -n "$folder" ] || die "which folder? $PRUN nfs del <folder> [who]"
	nfs_folder_ok "$folder" || die "'$folder' isn't a folder name the NAS uses"
	nfs_arg_ok "$who" || die "who must be a computer's name, an IP address or a network"
	nfs_need
	if [ -z "$(nfs_line "$folder")" ]; then
		echo "/mnt/data/$folder isn't shared over NFS. Nothing changed."; return
	fi
	on "/usr/sbin/nas-nfs del '$folder' '$who'"
	if [ -n "$who" ]; then echo "$who can no longer use /mnt/data/$folder over NFS (the files are untouched)"
	else echo "stopped sharing /mnt/data/$folder over NFS (the folder and its files are untouched)"; fi
}

nfs_computer_add() {
	[ -n "$1" ] && [ -n "$2" ] || die "use: $PRUN nfs computer-add <name> <ip>, e.g. \"Linux PC\" 192.168.1.20"
	nfs_arg_ok "$1" && nfs_arg_ok "$2" || die "names and addresses can't contain quotes, \\, \$ or \`"
	nfs_need
	on "/usr/sbin/nas-nfs computer-add '$1' '$2'"
	echo "added $1 ($2). Share a folder with it: $PRUN nfs add <folder> rw \"$1\", or on the dashboard's NFS page."
}

nfs_computer_del() {
	[ -n "$1" ] || die "use: $PRUN nfs computer-del <name|ip>"
	nfs_arg_ok "$1" || die "names and addresses can't contain quotes, \\, \$ or \`"
	nfs_need
	ask "Remove $1? It loses NFS access to every folder." || { echo cancelled; exit 1; }
	on "/usr/sbin/nas-nfs computer-del '$1'"
	echo "removed $1."
}

nfs_status() {
	on '[ -x /usr/sbin/nas-nfs ] && /usr/sbin/nas-nfs status || echo "NFS server: not installed"'
}

nfs_uninstall() {
	nfs_need
	ask "Stop sharing every folder over NFS and remove the NFS server? (No files are deleted.)" || { echo cancelled; exit 1; }
	# touch: browsers reload the dashboard, which hides the NFS controls again
	on '/usr/sbin/nas-nfs remove && rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache && touch /lib/apk/db/installed'
}

plugin_main() {
	cmd=$1; [ $# -gt 0 ] && shift
	case "$cmd" in
		install)   nfs_install ;;
		add)       nfs_add "$@" ;;
		del)       nfs_del "$@" ;;
		computer-add) nfs_computer_add "$@" ;;
		computer-del) nfs_computer_del "$@" ;;
		status)    nfs_status ;;
		uninstall) nfs_uninstall ;;
		*)         plugin_help nfs; exit 1 ;;
	esac
}
