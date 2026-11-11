# Maintenance

[← README](../README.md) · [Install OpenWrt](INSTALL-OPENWRT.md) · [Setup guide](SETUP-GUIDE.md) · [Windows](WINDOWS.md) · **Maintenance**

Everyday care, upgrades, disks and troubleshooting. Commands starting with `nas#` run on the
NAS: connect first with `ssh root@nas.local`.

---

## Everyday tasks

| Task | How |
|---|---|
| **Add a user or share** | Dashboard → **Users** / **Shares**. New shares get a recycle bin; Time Machine shares don't. |
| **Restore a deleted file** | Open the share, show hidden files (Mac: `Cmd`+`Shift`+`.`; Windows: *View → Show → Hidden items*), open `.recycle`, drag the file back. Files are kept for 30 days by default. |
| **Time Machine** | Tick **Time Machine** on a share (optionally capped in GB). On the Mac: *System Settings → General → Time Machine → Add Backup Disk*. |
| **Rename the NAS** | Click the name chip on the dashboard. Afterwards, check that Time Machine still finds its disk. |
| **USB drive** | Plug it in and it's shared as `smb://nas.local/<label>`. Eject it from the dashboard: a USB hard drive also spins down, so it can be unplugged safely. FAT32, exFAT, NTFS and ext all work. |
| **Recycle bin settings** | Dashboard → **Services** card → **Recycle bin**: keep deleted files 7 to 90 days or forever, switch the bin off for all shares, or **Empty recycle bin…** (all shares or one; permanent). Per share: the switch when editing a share. |
| **Disk sleep** | Dashboard → **Services** card → **Disk sleep**: spin the disks down after 5 minutes to 2 hours without use, or never. |
| **Test e-mail alerts** | `nas# nas-alert test`. Retry queued mail with `nas# nas-alert flush`. Limits are in `/etc/config/nas-alert`. |

## Health check

After any change or reboot:

```sh
nas# cat /proc/mdstat                 # md1 … [2/2] [UU] = both disks in sync
nas# grep /mnt/data /proc/mounts      # /dev/md1 mounted (never sda2/sdb2 directly)
nas# for s in samba4 avahi-daemon wsdd2 nas-fan nas-watch hd-idle cron; do
       /etc/init.d/$s running && echo "$s: running"; done
nas# cat /tmp/nas-fan.status          # temperatures the fan is reacting to
nas# hdparm -C /dev/sda /dev/sdb      # "standby" = disks asleep
```

On a Mac, `dns-sd -B _adisk._tcp` should list the NAS (Time Machine discovery).

## Updates

| What | How |
|---|---|
| **This project** | Get the new version of the repo, then `./setup.sh update` (Windows: `.\setup.cmd update`). It only replaces scripts, dashboard and theme, never your settings. |
| **OpenWrt** | Dashboard → **System → Attended Sysupgrade**, or `nas# owut upgrade`. It builds an image with your packages included, and everything from this project survives. Afterwards, run the health check, then `./setup.sh update` if anything is missing. |

## Power-off and Wake-on-LAN

- **Shut down** on the dashboard really cuts the power (the microcontroller does it, as WD's
  firmware did). The unit has no power button. Start it again with Wake-on-LAN or by
  replugging the power:

  | | |
  |---|---|
  | Mac / Linux | `mac/wake-nas <MAC>` |
  | Windows | `.\windows\wake-nas.cmd <MAC>` |
  | Phone | Any Wake-on-LAN app |

- **Wake-on-LAN** is on by default. Click **Wake-on-LAN** on the dashboard's **Services** card
  to see the MAC address, the wake commands and whether it was armed at the last power-off,
  or to switch it off (then only replugging the power starts the NAS).

- **Idle power-off** is off by default. To switch the NAS off after a while with no file
  activity, no SMB connection and no RAID sync, click **Idle power-off** on the dashboard's
  **Services** card and choose a time (12 hours to 1 week). From the command line:
  ```sh
  nas# uci set nas-alert.main.idle_poweroff_hours=48; uci commit nas-alert   # 0 = off
  ```
  On a Mac that backs up with Time Machine, `mac/install-wake-agent.sh <NAS MAC> nas.local`
  wakes the NAS whenever a backup is due.

## Disks and RAID

> [!WARNING]
> **Never mount `sda2` or `sdb2` directly**, only `/dev/md1`. WD's RAID format makes each disk
> look like a normal ext4 disk, and mounting one silently splits the mirror.

- **Status:** dashboard **Protection** card, or `nas# cat /proc/mdstat`.
- **Monthly check:** runs on the 1st at 03:00, and the result is e-mailed. To run one now:
  `nas# echo check > /sys/block/md1/md/sync_action`.
- **Nothing rebuilds automatically.** A rebuild only starts when you run it yourself.

<details>
<summary><b>Replace a failed disk</b> (example: bay 1 = <code>sda</code>, rebuilt from the good disk <code>sdb</code>)</summary>

Write down the serial numbers first. Make sure `sda` really is the disk you mean.

```sh
nas# smartctl -i /dev/sda | grep Serial                     # is it the disk you mean?
nas# mdadm /dev/md1 --fail /dev/sda2 --remove /dev/sda2     # if it's still in the array
nas# apk add sgdisk
nas# sgdisk -R /dev/sda /dev/sdb && sgdisk -G /dev/sda      # copy sdb's partition table TO sda
nas# mdadm --zero-superblock /dev/sda2
nas# mdadm /dev/md1 --add /dev/sda2                         # ~6 h for 4 TB; the NAS stays usable
```

You get an e-mail when the rebuild starts and when it finishes.

</details>

## Fan and temperatures

`nas-fan` checks every 30 seconds, using WD's own rules for this model (from WD firmware
5.29.102):

| Sensor | One step faster above | Full speed above | Slower when all below |
|---|---|---|---|
| Board | 64 °C | 73 °C | 56 °C |
| Processor | 85 °C | 90 °C | 80 °C |
| Disks (spinning only) | 59 °C | 64 °C | 56 °C |

- The fan slows down by one step per 5 minutes while everything is cool. It goes to full
  speed during a RAID rebuild or check, or if a sensor can't be read.
- If the fan stops, it gets a kick at full speed. If it still doesn't spin, the LED blinks
  red and you get an e-mail.
- **Overheat shutdown** after 3 minutes over the limit: disk 70 °C, board 82 °C, processor
  100 °C (in `/etc/config/nas-alert`).

> [!NOTE]
> The processor idles around 70 °C. That's normal for this chip, which has no power-saving
> idle mode in Linux.

## Security

The NAS is built for a trusted home network. What protects your files:

- **Samba decides who gets in.** Each share lists the users who may open it, read-only or
  read-write, and every user needs a password. New passwords must be at least 8 characters.
- **Only `root` can log in to the NAS.** The users you add are Samba-only: they have no shell
  and can't use SSH.
- **Nothing faces the internet.** No public IPv6, no cloud, no port forwarding. Keep it that
  way: don't forward ports 445 or 22 to the NAS on your router.

What it does *not* do is lock files per user on the NAS itself. Samba writes every file as
`root` (`force_root`), so the folder permissions on disk aren't what keeps people apart. Anyone
with root access to the NAS can read everything, as on any NAS.

New shares create files as `0644` and folders as `0755`. Shares and folders made by older
versions used `0666`/`0777`; running `setup.sh code` (or `install`) switches existing shares to
the new modes for files written from then on. Folders that already exist keep their modes. To
tighten one as well (safe: Samba ignores these bits for access):

```sh
nas# chmod -R go-w /mnt/data/<folder>
```

USB drives stay at `0666`/`0777` on purpose, so the drive still works when you plug it into
another computer.

User and password changes are saved in one step (written to a new file, then swapped in), so a
power cut while you add or delete a user can't leave `/etc/passwd` or `/etc/shadow` half-written.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `REMOTE HOST IDENTIFICATION HAS CHANGED` right after installing OpenWrt | Expected: the preflight saved the WD firmware's SSH identity for the same address. Mac/Linux: `ssh-keygen -R <NAS IP>`, then connect again. Windows: `.\setup.cmd key` offers to do this. Only do it if you just reinstalled the NAS. |
| Files on the NAS owned by your computer's user ID (`ls -ln /usr/share/rpcd/ucode/luci.nas` shows 501 or 1000 instead of 0) | Installs from Mac or Linux before November 2026 kept your computer's user ID on the copied files. Run `./setup.sh update` once: it sets them back to root and removes macOS `._` files. |
| Dashboard's NAS pages fail to load after installing from Windows | Installs from Windows before November 2026 left files writable by everyone, and rpcd skipped the dashboard backend. Run `.\setup.cmd update` once. |
| Dashboard shows old pages after an update | `nas# touch /lib/apk/db/installed`, then reload the page (`setup.sh update` does this for you) |
| Dashboard says "Storage is offline" | `nas# cat /proc/mdstat`. If md1 isn't running: `nas# /etc/init.d/nas-datamount start`. It re-assembles the mirror from its own disks and mounts it. |
| NAS missing in Finder or Time Machine | `nas# /etc/init.d/avahi-daemon restart`. If the log says "not allowed to own org.freedesktop.Avahi", run `nas# kill -HUP $(pidof dbus-daemon)` first. |
| Avahi "Local name collision" | Samba is advertising itself too. Check `multicast dns register = no` in `/etc/samba/smb.conf.template`, restart samba4, then run `nas-names apply`. |
| Time Machine: "connection refused" | Samba must listen on IPv6 too (Macs try it first). The template sets `bind interfaces only = no`. |
| Disks never sleep | `nas# hdparm -C /dev/sda`. Find what keeps reading with `cat /proc/diskstats` over a few minutes. The dashboard and alerts never wake disks. |
| No alert e-mails | `nas# nas-alert test`. Check `/etc/nas-alert.pass` and `logread \| grep nas-alert`. |
| Fan stuck at full speed | `nas# cat /tmp/nas-fan.status` (RAID sync running? sensor unreadable?) and `logread \| grep nas-fan` |

<details>
<summary><b>Where things live</b> (for the curious)</summary>

| What | In this repo | On the NAS |
|---|---|---|
| Theme | `luci-theme-nasos/` | `/www/luci-static/nasos/`, `/usr/share/ucode/luci/template/themes/nasos/` |
| Dashboard | `luci-app-nas/` | `/www/luci-static/resources/{nas,view/nas}/`, `/usr/share/rpcd/ucode/luci.nas` |
| Fan control | `nas-fan` | service `nas-fan` (microcontroller on `/dev/ttyS1`) |
| Health watch and alerts | `nas-watch`, `nas-alert` | service `nas-watch`, settings in `/etc/config/nas-alert` |
| Power-off and Wake-on-LAN | `nas-poweroff` | dashboard Shut down, overheat and idle power-off |
| Data mount at boot | `init.d/nas-datamount` | runs right after mdadm |
| USB sharing | `nas-usb` | drives mount at `/mnt/usb/<label>` |
| Cold-storage copies | `nas-coldsync` | dashboard card |
| Names | `nas-names` | `/etc/avahi/services/nas.service` |
| Recycle-bin cleanup | `nas-recycle-clean` | cron, Sundays 04:30; days from `nas-alert.main.recycle_days` |

</details>
