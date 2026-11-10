# EX2 Ultra Reborn

**A WD My Cloud EX2 Ultra on OpenWrt: a quiet, simple NAS that outlives WD support.**

Scripts, a dashboard and a theme that turn a **WD My Cloud EX2 Ultra** running
**OpenWrt 25.12** into a no-frills home NAS: SMB shares, Time Machine for Macs, disks that
sleep, a fan that stays quiet, and e-mail alerts. Your existing WD data volume is kept as it is.

WD's firmware for this model is near the end of its support. OpenWrt supports the EX2 Ultra
officially, gets security updates, and uses far less memory than WD's firmware.

| Folder | What it is |
|---|---|
| `luci-theme-nasos/` | "NAS OS" LuCI theme: soft, borderless, NAS pages first, phone layout |
| `luci-app-nas/` | NAS pages: overview dashboard, users, shares, USB drives, cold-storage copies, rename, shut down |
| `nas-system/` | System side: fan control, health watch and e-mail alerts, overheat shutdown, real power-off with Wake-on-LAN, RAID mount at boot, USB auto-share, recycle-bin cleanup |
| `mac/` | Optional Mac helpers: wake the NAS by Wake-on-LAN, auto-wake for Time Machine |
| `preflight-wd.sh` | Run **before** flashing, on WD firmware: confirms the model, saves a flash backup (read-only) |
| `setup.sh` | Installs all of it on the NAS over SSH, after flashing |
| `CLAUDE.md` | Rules and conventions for working on this repo with Claude Code |

> **Only for the WD My Cloud EX2 Ultra.** Other WD models (Mirror Gen2, EX2100, EX4100,
> PR2100, …) use different hardware, and the fan and power code talks to this model's
> microcontroller. Both scripts refuse to run on anything else:
> - `preflight-wd.sh` (on WD firmware) requires WD model number `BVBZ`, 2 drive bays and
>   the EX2 Ultra's exact 8-partition flash layout. The same WD firmware image also serves
>   the Mirror Gen2, so this check matters.
> - `setup.sh` (on OpenWrt) requires all of: board `wd,cloud-ex2-ultra`, device tree
>   `wd,cloud-ex2-ultra` + `marvell,armada385`, model "WD MyCloud Ex2 Ultra", OpenWrt
>   target `mvebu/cortexa9`, and the microcontroller port `/dev/ttyS1`.

## What you get

- **Shares and users** managed from simple pages (no Samba knowledge needed), with a
  30-day recycle bin on every share except Time Machine.
- **Time Machine** share with an optional size cap, advertised to Macs automatically.
- **Quiet fan:** WD's own temperature rules, read from the stock firmware, in real °C.
  Sleeping disks are never woken to read their temperature.
- **Disk sleep** after 10 minutes (hd-idle), and a monthly RAID data check.
- **Alerts by e-mail:** RAID degraded or rebuilt, disk hot or failing (SMART), storage full,
  fan stopped, unexpected restart, network link down.
- **Overheat protection:** shuts down cleanly if a disk, the board or the processor stays
  too hot for 3 minutes.
- **Real power-off** from the dashboard. The power is actually cut, like WD's firmware does,
  and Wake-on-LAN turns it back on. An optional idle power-off can switch the NAS off after
  N hours without use.
- **USB drives** are shared automatically and ejected from the dashboard. **Cold storage**
  copies or syncs chosen folders to a USB drive, with live progress.
- **Not exposed to the internet:** no public IPv6 address, and no cloud service.

## Quick start

1. **Check the model and back up the flash** while it still runs WD firmware (SSH on):
   ```sh
   ./preflight-wd.sh <NAS IP> --backup ./wd-flash-backup
   ```
   Continue only if it ends with "OK". Then **install OpenWrt**:
   see [docs/INSTALL-OPENWRT.md](docs/INSTALL-OPENWRT.md).
2. From a Mac or Linux PC on the same network:
   ```sh
   ssh-copy-id root@<NAS IP>                         # set a root password first (passwd)
   export NAS=root@<NAS IP>
   ./setup.sh check        # read-only: model, disks, RAID
   ./setup.sh packages     # needs internet on the NAS
   ./setup.sh data         # use the existing WD mirror as /mnt/data (no disk writes)
   ./setup.sh install      # asks for a name
   ssh $NAS reboot
   ./setup.sh alerts       # optional: e-mail alerts
   ```
3. Open `http://<name>.local`, sign in as `root`, and create users and shares on the NAS pages.

<details>
<summary><b>What each step looks like</b> (real output, recorded on a test VM with WD-style disks)</summary>

These were recorded on an OpenWrt virtual machine whose two disks are laid out exactly like
WD's (RAID 1 data mirror on partition 2). That's why `check` shows "QEMU" hardware; on a
real NAS you'll see your EX2 Ultra's details.

**`./setup.sh check`**: read-only overview

![setup.sh check](docs/images/setup-1-check.png)

**`./setup.sh packages`**: mdadm is installed without its scripts, as the OpenWrt wiki advises

![setup.sh packages](docs/images/setup-2-packages.png)

**`./setup.sh data`**: finds WD's data mirror and skips WD's swap arrays

![setup.sh data](docs/images/setup-3-data.png)

**`./setup.sh install`**

![setup.sh install](docs/images/setup-4-install.png)

**After the reboot**: the mirror is assembled, the files are intact, the services are running

![after reboot](docs/images/setup-5-after-reboot.png)

</details>

Later changes: edit the files, then `./setup.sh update`. Upgrade OpenWrt with
**System → Attended Sysupgrade**. Everything installed here is listed in
`/etc/sysupgrade.conf`, so it survives upgrades.

More detail: [docs/MAINTENANCE.md](docs/MAINTENANCE.md) covers health checks, disks and
RAID, the fan, and troubleshooting.

## Requirements and limits

- WD My Cloud EX2 Ultra with **two disks in WD RAID 1** (the data mirror on partition 2 of
  each disk). `setup.sh` never creates, formats or rebuilds arrays.
- OpenWrt **25.12 or newer** (apk package manager). The scripts run daily on 25.12.6. The install steps were also tested end to end on a virtual machine with WD-style disks: the data mirror came up with files intact, and SMB, Time Machine discovery, users, shares and the recycle bin all worked. Please open an issue if a step fails for you.
- Flash space is no issue: the full install uses about 22 MB of the NAS flash.
- Sharing is SMB only. No NFS, media server, cloud access or apps; that's on purpose.

## Safety notes

- **Never mount `sda2` or `sdb2` directly.** WD uses RAID superblock 1.0, so each member
  looks like a normal ext4 disk. A direct mount silently splits the mirror. `setup.sh data`
  turns off OpenWrt's automatic mounting of unknown partitions for this reason.
- Nothing here sends firmware or setup commands to the microcontroller. The commands it uses
  (fan speed, LED, temperature, Wake-on-LAN, power-off) are the ones WD's own firmware
  sends: they were read from WD firmware 5.29.102.
- Secrets are never stored in this repo: the SMTP password lives in `/etc/nas-alert.pass`
  on the NAS only.

## License

Apache License 2.0, see [LICENSE](LICENSE). The NAS OS theme is built on the
[LuCI Bootstrap theme](https://github.com/openwrt/luci) (Apache 2.0): `cascade.css` and
`mobile.css` are its unmodified stylesheets, and the header and footer templates are adapted
from it. Not affiliated with Western Digital or OpenWrt.
"My Cloud" is a trademark of Western Digital.
