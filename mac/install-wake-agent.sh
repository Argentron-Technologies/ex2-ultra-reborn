#!/bin/sh
# Install a small launchd agent on your Mac that wakes the NAS when Time Machine needs it.
#   ./install-wake-agent.sh <NAS MAC> [NAS host, default nas.local]
#   ./install-wake-agent.sh --remove
# The agent runs mac/wake-nas-for-timemachine every 10 minutes (log: ~/Library/Logs/wake-nas.log).
set -e
LABEL=local.nas.wake-for-timemachine
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR=$(cd "$(dirname "$0")" && pwd)

if [ "$1" = --remove ]; then
	launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
	rm -f "$PLIST"; echo "removed"; exit 0
fi
MAC=${1:?usage: $0 <NAS MAC address> [NAS host]}
HOST=${2:-nas.local}
GW=$(route -n get default 2>/dev/null | awk '/gateway:/ {print $2}')
[ -n "$GW" ] || { echo "no default gateway: connect to your home network first"; exit 1; }
echo "NAS $HOST ($MAC), home router $GW"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$LABEL</string>
	<key>ProgramArguments</key>
	<array><string>/bin/sh</string><string>$DIR/wake-nas-for-timemachine</string></array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>NAS_HOST</key><string>$HOST</string>
		<key>NAS_MAC</key><string>$MAC</string>
		<key>HOME_GW</key><string>$GW</string>
	</dict>
	<key>StartInterval</key><integer>600</integer>
	<key>RunAtLoad</key><true/>
	<key>StandardErrorPath</key><string>$HOME/Library/Logs/wake-nas.err</string>
</dict>
</plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed: $PLIST"
