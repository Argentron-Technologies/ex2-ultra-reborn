# Setup guide: from fresh OpenWrt to a working NAS

Start here once OpenWrt is installed ([install guide](INSTALL-OPENWRT.md)) and you can
`ssh root@<NAS IP>`. On Windows, run these commands in WSL: see [WINDOWS.md](WINDOWS.md).

> All screenshots are real output. Step 1 is from a real EX2 Ultra (addresses blurred). The
> other steps were recorded on a test install whose two disks are laid out exactly like
> WD's.

```sh
export NAS=root@<NAS IP>      # or root@nas.local once the NAS has its name
ssh-copy-id $NAS              # log in with your SSH key from now on
```

## Step 1: check (read-only)

```sh
./setup.sh check
```

It confirms this is a WD My Cloud EX2 Ultra running OpenWrt, and lists the disks. RAID
details appear once mdadm is installed in step 2.

![setup.sh check](images/setup-1-check.png)

## Step 2: install the packages

```sh
./setup.sh packages
```

This takes a few minutes, and the NAS needs internet access. mdadm is installed **without**
its install scripts, as the OpenWrt wiki advises for this NAS.

![setup.sh packages](images/setup-2-packages.png)

## Step 3: use your existing WD data mirror

```sh
./setup.sh data
```

It finds WD's data mirror (partition 2 of both disks) and skips WD's swap arrays. It
changes two config files only, and never writes to the disks. Answer `y`.

![setup.sh data](images/setup-3-data.png)

## Step 4: install the NAS software

```sh
./setup.sh install
ssh $NAS reboot
```

It asks for a local name (`nas` → `nas.local`) and a display name (shown in Finder and on
the dashboard), then installs fan control, alerts, the dashboard and the theme.

![setup.sh install](images/setup-4-install.png)

## Step 5: after the reboot

Optional check over SSH: the mirror is running on both disks (`[UU]`), the files are
untouched, and the services are up.

![after reboot](images/setup-5-after-reboot.png)

## Step 6: the dashboard

Open `http://nas.local` (or `http://<NAS IP>`) and sign in as `root`.

**Overview:** health at a glance. Mirror status, space, temperatures, fan, network, and
Restart and Shut down buttons.

![Dashboard overview](images/dashboard-overview.png)

**Users:** add the people (and devices) that may use the NAS. Each user's password is
what they type on their Mac or PC when they connect.

![Users page](images/dashboard-users.png)

**Shares:** choose folders to share and who may use them. Tick **Time Machine** on one
share for Mac backups, with an optional size cap. Every other share gets a 30-day recycle
bin.

![Shares page](images/dashboard-shares.png)

## Step 7: connect

- **Mac:** Finder → Network, or Go → Connect to Server → `smb://nas.local`. For Time
  Machine: System Settings → General → Time Machine → Add Backup Disk.
- **Windows:** File Explorer → Network, or `\\nas.local`. See [WINDOWS.md](WINDOWS.md).
- **Optional:** e-mail alerts with `./setup.sh alerts`.

Day-to-day care, health checks and troubleshooting: [MAINTENANCE.md](MAINTENANCE.md).
