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

## Testing changes

- Syntax: `sh -n setup.sh preflight-wd.sh nas-system/root/usr/sbin/* nas-system/root/etc/init.d/*`
  and `node --check` for the JS views.
- On a real NAS: `./setup.sh check` (read-only), then `./setup.sh update` for code-only
  changes.
- Without hardware: an OpenWrt x86-64 VM in QEMU with two virtual disks laid out like WD's
  (p1 swap md 1.2, p2 data RAID 1 with superblock 1.0 + ext4) exercises
  `packages` / `data` / `install` / reboot. Use a local copy of `setup.sh` whose `guard()` is
  stubbed, and never commit that copy. The fan and Wake-on-LAN code can't be tested in a VM.
