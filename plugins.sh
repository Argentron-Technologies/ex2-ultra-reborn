#!/bin/sh
# plugins.sh: optional extras for the NAS. Nothing here is installed by setup.sh; each
# plugin is added only when you ask for it, and can be removed again.
#
#   ./plugins.sh                         list the plugins
#   ./plugins.sh <plugin>                what a plugin does and its commands
#   ./plugins.sh <plugin> <command> ...  run one of its commands
#
#   NAS=root@192.168.1.50 ./plugins.sh nfs status   (default: root@nas.local, or root@openwrt.local)
#
# Run setup.sh first (packages, data, install): plugins build on that setup.
# Each plugin is one file, plugins/<name>.sh (see CLAUDE.md, "Adding a plugin").

HERE=$(cd "$(dirname "$0")" && pwd)
# helpers and the strict model check (guard) come from setup.sh, so both scripts share them
SETUP_AS_LIBRARY=1
. "$HERE/setup.sh"
if [ "$NAS" = local ]; then PRUN='.\plugins.cmd'; else PRUN='./plugins.sh'; fi

plugin_file() { printf '%s/plugins/%s.sh' "$HERE" "$1"; }
# the comment block at the top of a plugin file is its help text; "# about:" is its one-line summary
plugin_about() { sed -n 's/^# about: //p' "$(plugin_file "$1")"; }
plugin_help()  { awk 'NR == 1 { next } /^# about: / { sub(/^# about: /, ""); print; next }
	/^#/ { sub(/^# ?/, ""); print; next } { exit }' "$(plugin_file "$1")"; }

if [ -z "$1" ]; then
	echo "Optional plugins (nothing is installed until you run a plugin's install command):"
	echo
	for f in "$HERE"/plugins/*.sh; do
		[ -f "$f" ] || continue
		n=$(basename "$f" .sh)
		printf '  %-10s %s\n' "$n" "$(plugin_about "$n")"
	done
	echo
	echo "Details: $PRUN <plugin>"
	exit 0
fi

name=$1; shift
printf '%s\n' "$name" | grep -qE '^[a-z0-9-]+$' && [ -f "$(plugin_file "$name")" ] || \
	die "no plugin called '$name'. List them with: $PRUN"
if [ -z "$1" ]; then plugin_help "$name"; exit 0; fi

. "$(plugin_file "$name")"
find_nas "$name $*"
guard
on 'command -v smbd >/dev/null && [ -x /usr/sbin/nas-watch ]' || \
	die "the NAS isn't set up yet: run setup.sh packages, data and install first"
plugin_main "$@"
