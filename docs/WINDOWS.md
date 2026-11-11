# Windows

[← README](../README.md) · [Install OpenWrt](INSTALL-OPENWRT.md) · [Setup guide](SETUP-GUIDE.md) · **Windows** · [Maintenance](MAINTENANCE.md)

Everything works from **PowerShell** or **Command Prompt** on Windows 10 and 11. There's
nothing extra to install: the scripts use the `ssh`, `scp` and `tar` that come with Windows.

| Script | Does the same as | Used in |
|---|---|---|
| `.\preflight-wd.cmd` | `./preflight-wd.sh` | [Install OpenWrt](INSTALL-OPENWRT.md), step 2 |
| `.\setup.cmd` | `./setup.sh` | [Setup guide](SETUP-GUIDE.md) |
| `.\windows\wake-nas.cmd` | `mac/wake-nas` | Waking the NAS after a power-off |

---

## Get the repo

On GitHub, choose **Code → Download ZIP**, unzip it, and open the folder. In File Explorer,
type `powershell` (or `cmd`) in the address bar and press Enter to open a window in that
folder.

## Check that SSH is there

```powershell
ssh -V
```

If that fails: *Settings → System → Optional features → Add a feature →* **OpenSSH Client**.

## How it works

`setup.cmd` packs the repo, copies it into the NAS's memory with `scp`, and runs the same
`setup.sh` there that Mac and Linux use. Both platforms follow exactly the same steps and the
same model checks. The copy is removed afterwards.

The NAS address is asked for once per window. You can also pass it, or set it:

```powershell
.\setup.cmd check -Nas 192.168.1.50
$env:NAS = "192.168.1.50"        # PowerShell: remembered for this window
```

## Using the NAS from Windows

| | |
|---|---|
| **Find it** | File Explorer → **Network**, or type `\\nas.local` (or `\\<NAS IP>`) in the address bar |
| **Sign in** | With a user from the dashboard's **Users** page (not `root`) |
| **Drive letter** | Right-click a share → **Map network drive…** → tick *Reconnect at sign-in* |
| **Deleted a file?** | Shares with the recycle bin on (the default) have a hidden `.recycle` folder (*View → Show → Hidden items*); files stay there 30 days unless you changed it |

## Wake the NAS

After **Shut down** on the dashboard, or an idle power-off:

```powershell
.\windows\wake-nas.cmd 00:11:22:33:44:55
```

The MAC address is in the idle power-off e-mail. You can also run
`ssh root@<NAS IP> cat /sys/class/net/eth0/address` while the NAS is on. Any Wake-on-LAN app
for Windows or your phone works too.

## Troubleshooting

| Problem | Fix |
|---|---|
| `scp: unknown option -- O` | Windows 10's older scp doesn't know `-O`. Run the command without it (`setup.cmd` does this for you). |
| "running scripts is disabled on this system" | Use the `.cmd` launchers. They start PowerShell with the right setting for these scripts only. |
| `can't log in ... with your SSH key` | Run `.\setup.cmd key` first. |
| `Host key verification failed` or "the NAS's SSH identity changed" | Normal right after installing OpenWrt: the preflight saved the WD firmware's SSH identity for the same address. Run `.\setup.cmd key` and answer `y` when it asks to forget the old identity. Answer `N` if you did *not* just reinstall the NAS. |
| Installed from Windows before November 2026 | Run `.\setup.cmd update` once. Older versions left the dashboard files writable by every user on the NAS, and the dashboard's NAS pages could fail to load. |
| `\\nas.local` not found | Use the IP address instead: `\\192.168.1.50`. |
