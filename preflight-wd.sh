#!/bin/sh
# preflight-wd.sh: run BEFORE flashing OpenWrt, while the NAS still runs WD's firmware.
# Read-only: it never writes anything to the NAS.
#
#   ./preflight-wd.sh <NAS IP>                 check that this is a WD My Cloud EX2 Ultra
#   ./preflight-wd.sh <NAS IP> --backup <dir>  also copy all 8 flash partitions to <dir>
#                                              on this computer, with SHA-256 checksums
#
# Needs SSH turned on in the WD dashboard (user "sshd").
#
# What is checked, and where it comes from:
# - WD's model number in /etc/system.conf must be BVBZ (= My Cloud EX2 Ultra). WD's own
#   scripts read this file. The same WD firmware image also serves the My Cloud
#   Mirror Gen2, so the model number is what tells the two apart.
# - The flash layout must be exactly the EX2 Ultra's 8 partitions (/proc/mtd).
# - The unit must have 2 drive bays (DVC_DRIVE_COUNT in /etc/system.conf).

set -e
IP=${1:?usage: $0 <NAS IP> [--backup <dir>]}
NAS="sshd@$IP"
die() { printf '\nSTOP: %s\nNothing was changed. Do not flash OpenWrt with these scripts on this device.\n' "$*" >&2; exit 1; }

# EX2 Ultra flash layout under WD firmware: "<size> <name>" per partition
EXPECT_MTD='00500000 U-Boot
00500000 uImage
00500000 uRamdisk
0b900000 image.cfs
00f00000 rescue fw
01400000 config
00a00000 reserve1
00a00000 reserve2'

echo "== connecting to $NAS"
info=$(ssh -o ConnectTimeout=8 "$NAS" '
	if [ -f /etc/openwrt_release ]; then echo "OPENWRT"; exit 0; fi
	[ -r /etc/system.conf ] || { echo "NOSYSCONF"; exit 0; }
	echo "MODEL=$(sed -n "s/^modelNumber=\"\{0,1\}\([^\"]*\)\"\{0,1\}.*/\1/p" /etc/system.conf | head -1)"
	echo "BAYS=$(sed -n "s/^DVC_DRIVE_COUNT=\"\{0,1\}\([^\"]*\)\"\{0,1\}.*/\1/p" /etc/system.conf | head -1)"
	echo "MTD_BEGIN"; sed -n "s/^mtd[0-9]*: \([0-9a-f]*\) [0-9a-f]* \"\(.*\)\"$/\1 \2/p" /proc/mtd; echo "MTD_END"
	echo "DISKS=$(ls -d /sys/block/sd? 2>/dev/null | wc -l)"
	echo "RAID_BEGIN"; grep -A1 "^md" /proc/mdstat 2>/dev/null; echo "RAID_END"
') || die "can't connect over SSH. Turn on SSH in the WD dashboard and check the IP address."

case "$info" in
	OPENWRT*)   echo "This NAS already runs OpenWrt: skip this step and use ./setup.sh check."; exit 0 ;;
	NOSYSCONF*) die "no /etc/system.conf: this doesn't look like WD My Cloud firmware." ;;
esac

model=$(printf '%s\n' "$info" | sed -n 's/^MODEL=//p')
bays=$(printf '%s\n' "$info" | sed -n 's/^BAYS=//p')
mtd=$(printf '%s\n' "$info" | sed -n '/^MTD_BEGIN$/,/^MTD_END$/p' | sed '1d;$d')
disks=$(printf '%s\n' "$info" | sed -n 's/^DISKS=//p')
raid=$(printf '%s\n' "$info" | sed -n '/^RAID_BEGIN$/,/^RAID_END$/p' | sed '1d;$d')

echo "WD model number: ${model:-?}"
[ "$model" = BVBZ ] || die "model number is '${model:-unknown}', not BVBZ (My Cloud EX2 Ultra). These scripts are only for the EX2 Ultra."
echo "Drive bays:      ${bays:-?}"
[ "$bays" = 2 ] || die "WD reports ${bays:-an unknown number of} drive bays; the EX2 Ultra has 2."
echo "Flash layout:"; printf '%s\n' "$mtd" | sed 's/^/  /'
[ "$mtd" = "$EXPECT_MTD" ] || die "the flash layout differs from the EX2 Ultra's. This may be a different hardware revision."
echo "Disks found:     $disks"
echo "RAID (WD):"; printf '%s\n' "${raid:-  none}" | sed 's/^/  /'
printf '%s\n' "$raid" | grep -q '^md1 : active raid1' || \
	echo "NOTE: no RAID 1 data mirror (md1) is running. setup.sh needs two disks in WD RAID 1 mode."
echo
echo "OK: this is a WD My Cloud EX2 Ultra with the expected flash layout."

if [ "$2" = --backup ]; then
	dir=${3:?usage: $0 <NAS IP> --backup <dir>}
	mkdir -p "$dir"
	echo; echo "== backing up flash to $dir (read-only on the NAS)"
	n=0
	printf '%s\n' "$mtd" | while read -r size name; do
		f="$dir/mtd$n-$(echo "$name" | tr ' ' '_').bin"
		# nanddump (as the OpenWrt wiki suggests) when the WD firmware has it, else a plain read
		ssh -n "$NAS" "if command -v nanddump >/dev/null 2>&1; then nanddump -q /dev/mtd$n; else cat /dev/mtd$n; fi" > "$f"
		got=$(wc -c < "$f" | tr -d ' ')
		[ "$got" -eq $((0x$size)) ] || { echo "STOP: mtd$n read $got bytes, expected $((0x$size)). Try again." >&2; exit 1; }
		echo "  mtd$n $name: $got bytes"
		n=$((n + 1))
	done
	ssh "$NAS" 'cat /proc/mtd' > "$dir/proc_mtd.txt"
	(cd "$dir" && shasum -a 256 mtd*.bin > SHA256SUMS 2>/dev/null || sha256sum mtd*.bin > SHA256SUMS)
	echo "saved, with checksums in $dir/SHA256SUMS. Keep this folder safe: it is your way back to WD firmware."
fi
