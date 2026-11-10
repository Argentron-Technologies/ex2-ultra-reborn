# Using EX2 Ultra Reborn from Windows

Everything in this repo runs from a Windows PC through **WSL** (Windows Subsystem for
Linux), the Ubuntu that comes built into Windows 10 and 11. The same `preflight-wd.sh` and
`setup.sh` run there unchanged; there's no separate Windows version to keep in sync.

> The scripts only use standard Linux tools (`sh`, `ssh`, `tar`, `sed`, `grep`, `awk`),
> which WSL's Ubuntu provides. They were tested from macOS and on OpenWrt; the WSL route
> itself hasn't been tested end to end yet. If a step fails, please open an issue.

## 1. Install WSL (once)

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu
```

Restart when asked. Then open **Ubuntu** from the Start menu and choose a Linux user name
and password.

## 2. Get the repo (inside Ubuntu)

```sh
sudo apt update && sudo apt install -y git openssh-client
cd ~
git clone https://github.com/Argentron-Technologies/ex2-ultra-reborn.git
cd ex2-ultra-reborn
```

Keep the repo in your Ubuntu home folder (`~`), **not** under `/mnt/c/...`. Windows folders
lose the "executable" flag, and the scripts won't run there.

If you don't have an SSH key yet: `ssh-keygen -t ed25519` (press Enter for the defaults).

## 3. Use the NAS's IP address

Inside WSL, `nas.local` names often don't resolve, so use the NAS's IP address (find it in
your router's list of devices):

```sh
./preflight-wd.sh 192.168.1.50 --backup ./wd-flash-backup      # before flashing, on WD firmware
export NAS=root@192.168.1.50                                    # after flashing OpenWrt
ssh-copy-id $NAS
./setup.sh check
```

All the other steps are exactly as in the [install guide](INSTALL-OPENWRT.md) and the
[setup guide](SETUP-GUIDE.md). For the checksum in the install guide's step 3, Ubuntu uses:

```sh
sha256sum -c sha256sums --ignore-missing
```

Downloaded the OpenWrt images with your Windows browser? They're in
`/mnt/c/Users/<you>/Downloads` inside Ubuntu. Copy them to a folder in `~` first.

## 4. Using the NAS from Windows

- **Find it:** File Explorer → **Network**. The NAS shows up under its local name, because
  `wsdd2` advertises it to Windows. Or type `\\nas.local` (or `\\<IP>`) in the address bar.
- **Sign in** with a user created on the dashboard's **Users** page (not `root`).
- **Keep a share as a drive letter:** right-click the share → **Map network drive…** → tick
  **Reconnect at sign-in**.
- **Deleted a file?** Every share except Time Machine has a hidden `.recycle` folder: turn
  on *View → Show → Hidden items* to see it. Files stay there for 30 days.

## 5. Wake the NAS from Windows

If you use real power-off or idle power-off, wake the NAS with the Python helper (install
Python from python.org or the Microsoft Store):

```powershell
py mac\wake-nas 00:11:22:33:44:55
```

The MAC address is in the idle power-off e-mail, or run
`ssh root@<NAS IP> cat /sys/class/net/eth0/address`. Any Wake-on-LAN app for Windows or
your phone works too.
