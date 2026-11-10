# Running the NAS

Commands starting with `nas#` run in an SSH session on the NAS (`ssh root@nas.local`).

## Where things live

| What | In this repo | On the NAS |
|---|---|---|
| Theme | `luci-theme-nasos/` | `/www/luci-static/nasos/`, `/www/luci-static/resources/menu-nasos.js`, `/usr/share/ucode/luci/template/themes/nasos/` |
| Dashboard and backend | `luci-app-nas/` | `/www/luci-static/resources/{nas,view/nas}/`, `/usr/share/rpcd/ucode/luci.nas`, ACL and menu JSON |
| Fan control | `nas-fan` | service `nas-fan` (microcontroller on `/dev/ttyS1`, 19200 baud) |
| Health watch and alerts | `nas-watch`, `nas-alert` | service `nas-watch`, settings in `/etc/config/nas-alert` |
| Power-off and Wake-on-LAN | `nas-poweroff`, `init.d/nas-poweroff` | dashboard Shut down, overheat and idle power-off |
| Data mount at boot | `init.d/nas-datamount` | runs after mdadm (S13 → S14) |
| USB auto-share | `nas-usb`, `hotplug.d/block/30-nas-usb` | drives mount at `/mnt/usb/<label>` |
| Cold-storage copies | `nas-coldsync` | dashboard card |
| Names | `nas-names` | `/etc/avahi/services/nas.service` (generated) |
| Recycle-bin cleanup | `nas-recycle-clean` | cron, Sundays 04:30 |

## Health check (after any change or reboot)

```sh
nas# cat /proc/mdstat                 # md1 … [2/2] [UU]  (both disks)
nas# grep /mnt/data /proc/mounts      # /dev/md1 mounted (never sda2/sdb2 directly!)
nas# for s in samba4 avahi-daemon wsdd2 nas-fan nas-watch hd-idle cron; do
       printf "%s " $s; ubus call service list "{\"name\":\"$s\"}" | jsonfilter -e '@.*.instances.*.running'; done
nas# cat /tmp/nas-fan.status          # temperatures the fan is reacting to
nas# hdparm -C /dev/sda /dev/sdb      # standby = disks asleep
```
On a Mac, `dns-sd -B _adisk._tcp` should list the NAS (Time Machine discovery).

## Everyday tasks

- **Shares and users:** use the Shares and Users pages. New shares get a recycle bin
  automatically; Time Machine shares never do.
- **Restore a deleted file:** open the share, show hidden files (Mac: Cmd+Shift+.), open
  `.recycle`, and drag the file back. Files deleted more than 30 days ago are gone.
- **Time Machine:** create a share with "Time Machine" ticked (optionally capped in GB). On
  the Mac: System Settings → General → Time Machine → Add Backup Disk.
- **Rename the NAS:** click the name chip on the dashboard. Afterwards, check that Time Machine
  still finds its disk.
- **USB drive:** plug it in and it's shared as `smb://<name>.local/<label>`. Eject it from
  the dashboard. FAT32, exFAT, NTFS and ext all work.
- **Alerts:** `nas# nas-alert test` sends a test mail; `nas# nas-alert flush` retries
  queued mail. Limits are in `/etc/config/nas-alert`.

## Power-off and Wake-on-LAN

- **Shut down** on the dashboard really cuts the power: the microcontroller does it, as WD's
  firmware did. Start the NAS again with a Wake-on-LAN packet (`mac/wake-nas <MAC>`, or any
  WoL app), or by unplugging and replugging the power. The unit has no power button.
- **Idle power-off** is off by default. To turn it on, run
  `nas# uci set nas-alert.main.idle_poweroff_hours=48; uci commit nas-alert`. The NAS then
  powers off after 48 h with no file reads or writes, no SMB connection and no RAID sync.
  On a Mac that uses it for Time Machine, run
  `mac/install-wake-agent.sh <NAS MAC> <name>.local`. It wakes the NAS when a backup is due.
- `nas-poweroff` arms Wake-on-LAN with `ethtool -s eth0 wol d` and then `wol g`. Only
  setting `g` isn't enough: Linux skips the call when the mode looks unchanged, and the
  wake pin stays off. The result is logged to `/etc/nas-poweroff.last`.

## Upgrading OpenWrt

Use **System → Attended Sysupgrade**, or `nas# owut upgrade`. It builds an image that
already contains your installed packages, and everything custom survives because it's
listed in `/etc/sysupgrade.conf`. Afterwards, run the health check. If anything custom is
missing, run `./setup.sh update`.

## Disks and RAID

- Status: dashboard Protection card, or `nas# cat /proc/mdstat`.
- **Never mount `sda2`/`sdb2` directly**, always `/dev/md1`. WD uses superblock 1.0, so
  ext4 is visible on each member, and a raw mount silently splits the mirror.
- **Nothing rebuilds automatically.** A rebuild only starts when you run it. Note the serial
  numbers before any destructive command: `nas# smartctl -i /dev/sdX | grep Serial`.
- Rebuild example: replace bay 1 (`sda`), copying the layout from the good disk `sdb`.
  ```sh
  nas# smartctl -i /dev/sda | grep Serial                     # is it the disk you mean?
  nas# mdadm /dev/md1 --fail /dev/sda2 --remove /dev/sda2     # if still in the array
  nas# apk add sgdisk
  nas# sgdisk -R /dev/sda /dev/sdb && sgdisk -G /dev/sda      # copy sdb's table TO sda; new GUIDs
  nas# mdadm --zero-superblock /dev/sda2
  nas# mdadm /dev/md1 --add /dev/sda2                         # ~6 h for 4 TB; NAS stays usable
  ```
- Monthly check: 1st of the month at 03:00, with the result e-mailed. To start one by hand:
  `nas# echo check > /sys/block/md1/md/sync_action`.

## Fan and temperatures

`nas-fan` uses WD's own rules for this model (`/etc/wd/BVBZ-thermal.xml` in WD firmware
5.29.102), every 30 s:

| | one step faster above | full speed above | slow down when all below |
|---|---|---|---|
| board | 64 °C | 73 °C | 56 °C |
| processor | 85 °C | 90 °C | 80 °C |
| disks (spinning only) | 59 °C | 64 °C | 56 °C |

- It slows down one step per 5 minutes when everything is cool.
- It runs at full speed during a RAID rebuild or check, or if a sensor can't be read.
- If the fan reports 0 rpm, it gets a kick at full speed. If that fails, the LED blinks red
  and you get an e-mail.
- **The board sensor value is not °C.** The microcontroller returns a raw thermistor
  reading: higher means colder. `nas-fan` converts it with WD's own 188-entry table. A
  raw value of about 104 is 35 °C, not 104 °C.
- The processor idles around 70 °C. That's normal: Armada 38x has no CPU idle or frequency
  scaling in Linux.
- Overheat shutdown (`nas-watch`, after 3 minutes over the limit): disk 70 °C, board 82 °C,
  processor 100 °C. Change these in `/etc/config/nas-alert`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows old pages after an update | `nas# touch /lib/apk/db/installed`, then reload (`setup.sh update` does this) |
| NAS missing in Finder or Time Machine | `nas# /etc/init.d/avahi-daemon restart`; if the log says "not allowed to own org.freedesktop.Avahi": `nas# kill -HUP $(pidof dbus-daemon)` and restart Avahi |
| Avahi "Local name collision" | Samba is advertising itself too: check `multicast dns register = no` in `/etc/samba/smb.conf.template`, restart samba4, then `nas-names apply` |
| Time Machine: "connection refused" | The Mac may try the NAS's IPv6 link-local address first; the template sets `bind interfaces only = no` so Samba listens on IPv6 too |
| `/mnt/data` not mounted after boot | `nas# cat /proc/mdstat`; if md1 is missing: `mdadm --assemble --scan`, then `block mount`. Check that nothing mounted `sda2`/`sdb2` |
| Disks never sleep | `nas# hdparm -C /dev/sda`; find the reader with `cat /proc/diskstats` over a few minutes. Dashboard and alerts never wake disks |
| No alert mails | `nas# nas-alert test`; check `/etc/nas-alert.pass` and `logread \| grep nas-alert` |
| Fan stuck at full speed | `nas# cat /tmp/nas-fan.status` (RAID sync running? sensor unreadable?) and `logread \| grep nas-fan` |
