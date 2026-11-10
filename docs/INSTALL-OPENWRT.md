# Installing OpenWrt on the WD My Cloud EX2 Ultra

These are the steps from the official OpenWrt device page, in the order I used them, with
the checks from this repo added:
**https://openwrt.org/toh/western_digital/mycloud_ex2_ultra**
If that page and this guide ever disagree, trust the wiki: it's kept up to date.

You need a computer on the same network as the NAS: a Mac, a Linux PC, or a Windows PC
with WSL ([WINDOWS.md](WINDOWS.md); on Windows, run every command below in Ubuntu). Flashing doesn't touch
the disks or your data, but **back up anything irreplaceable first** anyway.

## 1. Turn on SSH in the WD firmware

In the WD dashboard, turn on SSH (network settings) and set its password. The SSH user is
`sshd`:

```sh
ssh sshd@<NAS IP>
```

## 2. Check the model and back up the flash

From the repo folder on your computer:

```sh
./preflight-wd.sh <NAS IP> --backup ./wd-flash-backup
```

It only reads from the NAS. Continue only if it ends with **OK**. It checks for WD model
number `BVBZ`, 2 drive bays, and this exact flash layout:

| mtd | size | name (WD) | name (OpenWrt) |
|---|---|---|---|
| mtd0 | 5 MiB | U-Boot | U-Boot |
| mtd1 | 5 MiB | uImage | kernel |
| mtd2 | 5 MiB | uRamdisk | uRamdisk |
| mtd3 | 185 MiB | image.cfs | ubi |
| mtd4 | 15 MiB | rescue fw | rescue fw |
| mtd5 | 20 MiB | config | config |
| mtd6 | 10 MiB | reserve1 | reserve1 |
| mtd7 | 10 MiB | reserve2 | reserve2 |

The backup folder holds all 8 partitions plus `SHA256SUMS`. Keep it safe: it's your only
way back to WD firmware.

## 3. Download OpenWrt and check it

Download four files for target **mvebu/cortexa9**, profile **wd_cloud-ex2-ultra**, from
https://downloads.openwrt.org/releases/ (pick the newest 25.12.x, then
`targets/mvebu/cortexa9/`), along with `sha256sums`:

| File | Used for |
|---|---|
| `…-wd_cloud-ex2-ultra-squashfs-uImage-factory.bin` | install: the kernel |
| `…-wd_cloud-ex2-ultra-squashfs-image-cfs-factory.bin` | install: the system |
| `…-wd_cloud-ex2-ultra-initramfs-kernel.bin` | recovery only (keep it) |
| `…-wd_cloud-ex2-ultra-squashfs-sysupgrade.bin` | recovery only (keep it) |

```sh
shasum -a 256 -c sha256sums --ignore-missing     # every file must say OK
```

## 4. Copy the two factory images to the NAS

Keep **only one OpenWrt version** in the download folder. The commands below use `*`
patterns, and two versions would match two files.

```sh
ls *-uImage-factory.bin *-image-cfs-factory.bin      # must list exactly 2 files
scp -O *-uImage-factory.bin *-image-cfs-factory.bin sshd@<NAS IP>:/tmp/
```

`-O` makes `scp` use the classic copy protocol. Since OpenSSH 9.0 (current macOS and Linux),
plain `scp` uses SFTP, which the WD firmware may not offer.

If `scp` still fails, this works with nothing but SSH. It keeps the original file names,
which the flash commands in step 5 rely on:

```sh
for f in *-uImage-factory.bin *-image-cfs-factory.bin; do
  ssh sshd@<NAS IP> "cat > /tmp/$f" < "$f"
done
```

## 5. Flash (the step that changes the NAS)

On the NAS (`ssh sshd@<NAS IP>`), run exactly these commands, from the wiki:

```sh
cd /tmp
ls -l *-uImage-factory.bin *-image-cfs-factory.bin      # exactly 2 files, same sizes as on your computer

flash_eraseall /dev/mtd1 && nandwrite --markbad -p /dev/mtd1 /tmp/*-uImage-factory.bin
ubiformat /dev/mtd3 -f /tmp/*-image-cfs-factory.bin -y

reboot
```

> **Do not** attach or check the new UBI from the WD firmware afterwards (for example
> `ubiattach -m 3`). The wiki reports that this made the first OpenWrt boot end in a reboot
> loop. Just reboot.

`mtd2` (uRamdisk) stays as it is: the OpenWrt kernel ignores it.

## 6. First boot

The first boot takes a few minutes. Find the NAS:

- **It may come up as a DHCP client.** Mine did: it appeared in my router's client list with
  a new address. Try `ssh root@<new IP>` (no password yet).
- **It may come up as `192.168.1.1`** with its own DHCP server, which is the wiki's listed
  default. If so, don't leave it on your home network, where it would clash with your router.
  Connect it straight to your computer, give the computer `192.168.1.2`, and run
  `ssh root@192.168.1.1`. Then switch it to a DHCP client:
  ```sh
  uci set network.lan.proto=dhcp; uci delete network.lan.ipaddr; uci delete network.lan.netmask
  uci commit network; reboot
  ```
  Then plug it back into your home network.

The fan runs at full speed and the power LED blinks until `setup.sh` installs fan control.
That's loud but normal.

Then set a root password and add your SSH key:

```sh
ssh root@<NAS IP> passwd
ssh-copy-id root@<NAS IP>
```

Give the NAS a fixed address (a DHCP reservation on your router is easiest), then continue
with the **[setup guide](SETUP-GUIDE.md)**.

## If it doesn't boot (recovery)

As long as U-Boot (mtd0) is intact, the NAS can be recovered. All methods need a **3.3 V
USB-serial adapter**:

- Connect it to header **JP2**: pin 1 = RX, pin 2 = GND, pin 5 = TX (cross TX/RX to the
  adapter; leave 3.3 V unconnected), at 115200 baud.
- U-Boot only stops on the key **1**, and you have 1 second.

**USB stick (easiest):** put the `initramfs-kernel.bin` on a FAT32 USB 2.0 stick. Stop U-Boot,
then:

```
usb start
fatload usb 0:1 0x02000000 openwrt-mvebu-cortexa9-wd_cloud-ex2-ultra-initramfs-kernel.bin;bootm 0x02000000 -
```

Once that OpenWrt is running from RAM, copy the `sysupgrade.bin` to `/tmp` and run
`sysupgrade -n /tmp/<file>` (this reformats the system UBI).
Never put a file `/GrandTeton/u-boot.bin` on that stick: U-Boot can reflash itself from it.

**Serial (YMODEM):** works with no network or stick, but it's slow (about 10 minutes):
`loady 0x02000000`, send the initramfs file, then `iminfo 0x02000000` and `bootm 0x02000000`.

**TFTP:** described on the wiki, but on some units (U-Boot 2013.01 v1.04) U-Boot's network
doesn't come up. Use USB or serial instead.
