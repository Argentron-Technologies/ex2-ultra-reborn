# CLAUDE.md

Guidance for Claude Code (and other AI coding assistants) working in this repo.

## What this is

Scripts, a LuCI dashboard and a LuCI theme that turn a **WD My Cloud EX2 Ultra** running
**OpenWrt 25.12+** (target `mvebu/cortexa9`, profile `wd_cloud-ex2-ultra`) into a simple NAS:
SMB shares, Time Machine, quiet fan, disk sleep, e-mail alerts, real power-off with
Wake-on-LAN.

| Path | What | Runs where |
|---|---|---|
| `preflight-wd.sh` | model check + flash backup, read-only | PC → NAS on **WD firmware** (user `sshd`) |
| `setup.sh` | installer: `check`, `packages`, `data`, `install`, `alerts`, `update` | PC → NAS on **OpenWrt** (user `root`) |
| `nas-system/root/` | shell scripts and init files, same paths as on the NAS (`/`) | NAS (BusyBox ash) |
| `luci-app-nas/` | dashboard: JS views in `htdocs/`, ucode rpcd backend `luci.nas` | NAS (`/www`, `/usr/share/rpcd`) |
| `luci-theme-nasos/` | theme on top of LuCI Bootstrap (Apache 2.0) | NAS |
| `mac/` | Wake-on-LAN helpers | user's Mac |
| `setup.cmd`, `preflight-wd.cmd`, `windows/*.ps1` | Windows versions (PowerShell 5.1+ and 7) | user's Windows PC |
| `docs/` | install guide, maintenance guide, screenshots | |

## Hard safety rules

This is a real NAS holding people's data, and some mistakes brick the device or split the
mirror. Do not break these rules, even if asked to "just try something":

1. **Never mount a RAID member** (`/dev/sda2`, `/dev/sdb2`) directly, only `/dev/md1`.
   WD uses md superblock 1.0, so each member looks like plain ext4. A direct mount silently
   splits the mirror.
2. **Never create, re-create, grow, add to or rebuild an array, and never format anything**,
   unless the user explicitly asks for that exact operation. Show the disk serial numbers
   first.
3. **Never install mdadm with its install scripts** (`apk add mdadm`). Use
   `apk add --no-scripts mdadm` and set `list devices '/dev/sd*'` first. Otherwise
   `mdadm --assemble --scan` probes the raw NAND, and the OpenWrt wiki reports reboots and
   0-byte files.
4. **Never send microcontroller (`/dev/ttyS1`) commands that aren't already in the code.**
   Use only the commands in `nas-fan` and `nas-poweroff`, which come from WD firmware 5.29.102.
   Never send firmware-update, MFG-mode or MCU-reset frames.
5. **Never write to the flash (`/dev/mtd*`)** or run `ubiattach` after `ubiformat`. Flashing
   is a manual, documented step (`docs/INSTALL-OPENWRT.md`), not something to script or
   improvise.
6. **Keep the model checks strict.** `guard()` in `setup.sh` and the checks in
   `preflight-wd.sh` must never be loosened or given a bypass switch. Other WD models
   (Mirror Gen2, EX2100, …) have different hardware, and WD ships the same firmware image
   for the Mirror Gen2.
7. **Don't guess hardware facts.** Register values, MCU bytes and temperature conversions
   must come from a primary source (WD firmware, datasheet, kernel source, OpenWrt wiki).
   Say what is verified and what isn't.
8. **Read-only first.** Before changing anything on a NAS, run `./setup.sh check` and
   explain what will change and how to undo it.
9. **Secrets never go in the repo.** The SMTP password lives only in `/etc/nas-alert.pass`
   on the NAS.

## Conventions

- NAS scripts are POSIX `sh` for **BusyBox ash**: no bash-isms, and no GNU-only flags
  (busybox `sed`, `grep`, `awk`, `date`).
- Configuration goes through **UCI** (`uci set …; uci commit …`), not by editing
  `/etc/config/*` with sed.
- Every file installed on the NAS must also be listed in `KEEP` in `setup.sh` (it ends up in
  `/etc/sysupgrade.conf`), or it disappears on the next OpenWrt upgrade.
- `setup.sh` steps must be safe to run twice (idempotent): check before appending
  (`grep -q … ||`).
- Remote commands in `setup.sh` run with `set -e`. `x=$(cmd)` aborts when `cmd` fails, so use
  `x=$(cmd || true)` for optional lookups.
- Prompts read from `/dev/tty`, because `ssh` consumes stdin.
- After changing dashboard or theme files on a NAS, run `touch /lib/apk/db/installed`
  (`setup.sh update` does this). It bumps LuCI's cache version so browsers load the new files.
- The device has no global IPv6 address on purpose (`network.lan6.disabled=1`). Samba
  listens on all addresses (`bind interfaces only = no`), because Macs try link-local IPv6
  first.

## Windows scripts

- `setup.ps1` doesn't duplicate any install logic. It uploads the repo with `scp` and runs
  `setup.sh` **on the NAS** with `NAS=local`, so `on()` runs commands locally. Any change to
  `setup.sh` must keep working in that mode: BusyBox ash, prompts from `/dev/tty` (it runs
  under `ssh -t`).
- **Never move binary data through PowerShell pipes or `Start-Process -RedirectStandard*`.**
  Both treat the data as text and corrupt it (measured: 498,176 bytes sent, 500,193
  arrived). Use `scp -O` (with a fallback to plain `scp` for Windows 10's OpenSSH 8.x), or
  `cmd.exe` `>` / `<` redirection from a temporary `.cmd` file.
- **No double quotes inside arguments to native programs.** Windows PowerShell 5.1 passes
  them on incorrectly. Build remote commands without `"` (for example `tr -d '\042'`).
- PowerShell doesn't expand `*` for native programs: use `(Get-ChildItem pattern).Name`.
- Don't redirect a native command's stderr (`2>$null`) while `$ErrorActionPreference =
  'Stop'`: PowerShell 5.1 turns it into a terminating error.
- Keep `.cmd` and `.ps1` files with CRLF line endings (`.gitattributes`), everything else LF.
- **Extract on the NAS with `tar -x -o`** (BusyBox: don't restore user:group). Otherwise files
  keep the PC's user ID (501 on macOS, 1000 on Linux; 1000 is also the first NAS user the
  dashboard creates). `fix_files` in `setup.sh` repairs older installs.
- **Exclude with `tar -X FILE`, never `--exclude`**: BusyBox tar has no `--exclude`, and on
  Windows `setup.sh` runs on the NAS with BusyBox. Keep `._*` (macOS metadata) and `.DS_Store`
  out of every archive: some NAS folders load or run every file in them (`/etc/uci-defaults`).
- Test on macOS/Linux with PowerShell 7 (`brew install powershell`) against a VM. The `cmd.exe`
  branch only runs on real Windows.

## Testing changes

- Syntax: `sh -n setup.sh preflight-wd.sh nas-system/root/usr/sbin/* nas-system/root/etc/init.d/*`
  and `node --check` for the JS views.
- On a real NAS: `./setup.sh check` (read-only), then `./setup.sh update` for code-only
  changes.
- Without hardware: an OpenWrt x86-64 VM in QEMU with two virtual disks laid out like WD's
  (p1 swap md 1.2, p2 data RAID 1 with superblock 1.0 + ext4) exercises
  `packages` / `data` / `install` / reboot. Use a local copy of `setup.sh` whose `guard()` is
  stubbed, and never commit that copy. The fan and Wake-on-LAN code can't be tested in a VM.

## Project knowledge (learned on a real EX2 Ultra)

These facts were verified on hardware or read from primary sources while building this.
Trust them over forum posts, and over your own assumptions.

**Hardware and boot**
- Armada 385 (88F6820), 2 × Cortex-A9, 1 GB RAM, 256 MB NAND, one 1 GbE port (Marvell
  88E1510 PHY), 2 SATA bays, 2 × USB 3.0. No power button.
- U-Boot 2013.01 v1.04 (2015). Autoboot stops only on key `1`. TFTP can fail on this U-Boot
  (`mvNetaPortEnable failed`). Recover from a FAT32 USB stick (initramfs) or by YMODEM over
  serial, then `sysupgrade -n`.
- Serial: header JP2, pin 1 RX, pin 2 GND, pin 5 TX, 3.3 V, 115200 8N1.
- The OpenWrt kernel ignores U-Boot's command line and WD's uRamdisk (mtd2).
- **Network after flashing: DHCP client, not 192.168.1.1.** OpenWrt's
  `/etc/board.d/02_network` sets `ucidef_set_interface_lan "eth0" "dhcp"` for
  `wd,cloud-ex2-ultra`, and reads WD's original MAC from the flash, so the router usually
  hands out the same IP as before. The wiki's "192.168.1.1" table is the generic template;
  don't copy it into the docs.
- No system suspend (`/sys/power` is missing). There's no CPU idle or frequency scaling on
  Armada 38x either, so the SoC idles around 70 °C. That's normal.

**Microcontroller (`/dev/ttyS1`, 19200 8N1, frames `FA b0 b1 b2 b3 b4 FB`)**
- MCU chip WT69P3. The command table comes from WD firmware 5.29.102 (`up_send_ctl`).
- Used here: `02 00 XX` fan level (`50` ≈ 1,800 rpm … `FF` full); `02 01` fan rpm
  (rpm = 300000 / raw); `26 00 XX 00 01` power LED; `03 01` device ready; `03 08` board
  temperature; `03 0a 01` Wake-on-LAN enable; `03 03 01 01 <s>` DeviceShutdown (the MCU
  cuts power `<s>` seconds later).
- **The board temperature byte (reply byte 6) is a RAW thermistor value, not °C.** Higher
  means colder. Convert with the 188-entry table copied from WD's `up_read_daemon` (offset
  0x2070), which is `BOARD_TABLE` in `nas-fan`. Raw 66–68 ≈ 54–55 °C at idle; raw 104 =
  35 °C. Reading it as °C once caused a false "106 °C" overheat shutdown.
- Fan rules are WD's own (`/etc/wd/BVBZ-thermal.xml`, real °C), with the CPU tightened. The
  thresholds are at the top of `nas-fan`.
- Without `nas-fan` running, the fan runs at full speed and the LED blinks. BusyBox has no
  `stty`, so `coreutils-stty` is required.

**Power-off and Wake-on-LAN**
- A real power-off (`nas-poweroff`) marks `/tmp/nas-poweroff`. The init script K99
  (`init.d/nas-poweroff`) then runs after the disks are unmounted and sends DeviceShutdown.
  A plain `reboot` never sets the mark.
- **WoL needs `ethtool -s eth0 wol d` and then `wol g`.** A plain `wol g` is a no-op when the
  PHY already reports `g` (kernel `net/ethtool/wol.c`), which leaves the wake pin off. Verify
  with `mdio f1072004.mdio-mii mva 0 raw 3:18` (bit 7 set) and `… raw 0:18` (bit 7 set).
  This needs `mdio-tools` and `kmod-mdio-netlink`.
- Idle power-off (`nas-watch` `check_idle`) uses `/sys/block/md1/stat` read and write
  counters, plus no SMB connections and no RAID sync. Off by default (`idle_poweroff_hours 0`).

**Disks and RAID**
- WD layout per disk: p1 = swap (one md array per disk, metadata 1.2), p2 = data (RAID 1
  `md1`, metadata **1.0**, ext4), p3/p4 = small WD partitions.
- After `block-mount` is installed, OpenWrt writes disabled fstab entries for `/mnt/sda2`
  and `/mnt/sdb2` (the raw members). `setup.sh data` deletes them and sets `anon_mount=0`.
- Boot order: mdadm (S13) assembles `md1`, then `nas-datamount` (S14) runs `block mount`.
  Before this fix, `md1` never assembled because the raw member was mounted first.
- **Never auto-add or re-add a returning disk.** A user may keep the second disk as an
  offline backup, and a hotplug re-add would overwrite it. After any raw mount, a bitmap
  re-add is unsafe anyway: it needs a full `--add`, and only when the user asks.
- `nas-watch` and `nas-fan` never wake sleeping disks: they check `hdparm -C` first and use
  `smartctl -n standby`.

**Network, Samba, discovery**
- Samba's own mDNS is off (`multicast dns register = no`). `nas-names` writes
  `/etc/avahi/services/nas.service` (mode 644) with `_smb`, `_device-info` and `_adisk` (Time
  Machine). If Samba advertises too, Avahi reports "Local name collision".
- Avahi installed after dbus started fails with "not allowed to own org.freedesktop.Avahi".
  Fix: `kill -HUP $(pidof dbus-daemon)`, then restart Avahi (`setup.sh packages` does this).
  If Avahi goes silent after conflicts: `avahi-daemon -k; avahi-daemon -D`.
- Macs resolve `.local` to the link-local IPv6 address first, so Samba must listen on IPv6
  too, or Time Machine fails with ECONNREFUSED. Keep link-local IPv6. Without an AAAA record,
  macOS waits 5 s on every `.local` lookup.
- `wsdd2` gives up if Samba isn't running yet at boot. `rc.local` retries it once after 30 s.
- OpenWrt has no sftp server. Copy files with tar over ssh, and set `COPYFILE_DISABLE=1` on
  macOS so no `._*` files go along.

**USB**
- Both ports do USB 3 (about 125–150 MB/s from a USB stick). A USB 3 link that drops to USB
  2 seconds after plugging in was a seating problem, not a port fault: reseat the drive.
- `nas-usb` touches only USB-attached devices (`is_usb`), never the SATA bays.

**Deliberately out of scope** (tried, then removed at the owner's request; don't re-add
without being asked)
- NFS.
- Media servers:
  - OwnTone: the Mac Music app fetched artwork per song, ~11 minutes per open.
  - MiniDLNA: its WMA tag reader crashes on some files and aborts the scan.
- Cloud access, extra apps, Docker.

The goal is file sharing plus Time Machine, kept simple.

## How to update and add features

**Everyday update cycle**
1. Edit the files in this repo, never directly on the NAS. The repo is the source of truth.
2. Run `sh -n` on every shell file you touched, and `node --check` on every JS view.
3. Run `./setup.sh update`. It copies scripts, dashboard and theme, reloads rpcd, restarts
   `nas-fan` and `nas-watch`, and bumps the LuCI cache.
4. Check: `logread | grep nas-` on the NAS, reload the dashboard, and run the health check in
   `docs/MAINTENANCE.md`.
5. Commit with a plain message, authored by the maintainer. **No AI co-author or session
   trailers.**

**Adding a NAS-side feature (script or service)**
- Put the script in `nas-system/root/usr/sbin/nas-<name>`. If it's a service, add
  `nas-system/root/etc/init.d/nas-<name>` (procd, `USE_PROCD=1`; pick START/STOP so it runs
  after what it needs, e.g. after S14 for `/mnt/data`).
- In `setup.sh`:
  - add the paths to `SYSTEM_FILES`, so they get copied;
  - add them to `KEEP`, including the `/etc/rc.d/S??…`/`K??…` links, so they survive upgrades;
  - add the service to the enable loop in `cmd_code`.
- New settings go in a UCI file under `nas-system/root/etc/config/`. Like `nas-alert`, it is
  copied only if it doesn't exist yet, so updates never overwrite a user's settings.
- New packages go in `PACKAGES`, unless they need special handling (see `mdadm`). Keep flash
  use small, and check `df -h /overlay`.
- Must never wake sleeping disks, must not spam e-mail (`nas-alert send <key> … <repeat_hours>`
  rate-limits per key), and must log with `logger -t nas-<name>`.

**Adding a dashboard feature**
1. Backend: add a method in `luci-app-nas/root/usr/share/rpcd/ucode/luci.nas` (inside
   `methods`, with `args:` and `call:`). Quote shell arguments with `shq()`, and validate
   every input.
2. Permissions: add the method name to `luci-app-nas/root/usr/share/rpcd/acl.d/luci-app-nas.json`,
   under `read` if it only reads and `write` if it changes anything. A method missing from the
   ACL fails with "Access denied".
3. Frontend: declare it in `htdocs/luci-static/resources/nas/common.js`
   (`rpc.declare({ object: 'luci.nas', method: '…', params: [ … ] })`), and use it from a view
   in `htdocs/luci-static/resources/view/nas/`.
4. A new page needs an entry in `root/usr/share/luci/menu.d/luci-app-nas.json` and a view file.
5. Run `./setup.sh update`; it reloads rpcd. Test the backend on the NAS with
   `ubus call luci.nas <method> '<json>'`.
6. Use the existing helpers in `common.js` (`nas.tile`, `nas.pill`, `nas.button`,
   `nas.field`, `nas.notify`) and the theme's classes, so new pages match.

**Theme changes**
- Only `nasos.css`, `menu-nasos.js` and the `.ut` templates are ours. `cascade.css` and
  `mobile.css` are LuCI Bootstrap's unmodified files: update them by copying newer
  versions from upstream, never by editing. Keep the Bootstrap copyright notices
  (Apache 2.0).

**Upgrading OpenWrt**
- Use System → Attended Sysupgrade, or `owut upgrade`. It builds an image that already
  includes the installed packages, and the `KEEP` files survive. Afterwards, run
  `./setup.sh check` and `./setup.sh update`.

**Docs to update with a feature**
- README "What you get".
- `docs/MAINTENANCE.md`: the "Where things live" table, plus troubleshooting if relevant.
- This file, if you learned a new hardware fact or a new rule.
