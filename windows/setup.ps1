<#
.SYNOPSIS
  EX2 Ultra Reborn installer for Windows (PowerShell or Command Prompt).

.DESCRIPTION
  Uploads this repo to the NAS (into RAM, /tmp) and runs the same setup.sh there that the
  Mac/Linux instructions use, so both follow exactly the same, tested steps and the same
  strict model checks. Needs only what Windows 10/11 already include: ssh and tar.

  Steps, in order:
    .\setup.cmd key        add your SSH key to the NAS (asks for the NAS root password once)
    .\setup.cmd check      read-only: is this an EX2 Ultra on OpenWrt? which disks and RAID?
    .\setup.cmd packages   install the packages this setup needs (the NAS needs internet)
    .\setup.cmd data       use the existing WD data mirror (RAID 1) as /mnt/data; never formats
    .\setup.cmd install    scripts, dashboard and theme; names, fan, alerts, disk sleep; reboot
    .\setup.cmd alerts     optional: e-mail alerts
    .\setup.cmd update     later: re-copy scripts, dashboard and theme only

  The NAS address is asked for once, or pass it:  .\setup.cmd check -Nas 192.168.1.50
  (or set it for the session:  $env:NAS = "192.168.1.50")
#>
param(
	[Parameter(Position = 0)]
	[ValidateSet('key', 'check', 'packages', 'data', 'install', 'alerts', 'update')]
	[string]$Command,
	[string]$Nas = $env:NAS
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot

function Stop-Setup([string]$Message) {
	Write-Host "STOP: $Message" -ForegroundColor Red
	exit 1
}

if (-not $Command) {
	Get-Help $PSCommandPath -Detailed | Out-Host
	exit 1
}
foreach ($tool in 'ssh', 'scp', 'tar') {
	if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
		Stop-Setup "'$tool' is missing. On Windows 10/11: Settings > System > Optional features > add 'OpenSSH Client'."
	}
}
if (-not $Nas) { $Nas = Read-Host 'NAS address (IP, e.g. 192.168.1.50)' }
if (-not $Nas) { Stop-Setup 'no NAS address given.' }
if ($Nas -notmatch '@') { $Nas = "root@$Nas" }
$env:NAS = $Nas.Substring($Nas.IndexOf('@') + 1)   # remembered for this window

# --- key: install the user's SSH public key on the NAS -------------------------------
if ($Command -eq 'key') {
	$sshDir = Join-Path $HOME '.ssh'
	$pub = Join-Path $sshDir 'id_ed25519.pub'
	if (-not (Test-Path $pub)) {
		Write-Host '== creating an SSH key (press Enter to accept the defaults)'
		if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }
		& ssh-keygen -t ed25519 -f (Join-Path $sshDir 'id_ed25519')
		if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pub)) { Stop-Setup 'could not create an SSH key.' }
	}
	Write-Host "== adding your key to $Nas (type the NAS root password when asked)"
	$key = (Get-Content -Raw $pub).Trim()
	if ($key -notmatch '^ssh-[a-z0-9-]+ [A-Za-z0-9+/=]+( [^'']*)?$') { Stop-Setup "unexpected key format in $pub" }
	& ssh -o ConnectTimeout=8 $Nas "umask 077; mkdir -p /etc/dropbear; grep -qxF '$key' /etc/dropbear/authorized_keys 2>/dev/null || echo '$key' >> /etc/dropbear/authorized_keys"
	if ($LASTEXITCODE -ne 0) { Stop-Setup "could not add the key (ssh exit code $LASTEXITCODE)." }
	& ssh -o BatchMode=yes -o ConnectTimeout=8 $Nas true
	if ($LASTEXITCODE -ne 0) { Stop-Setup 'the key was added, but key login still fails.' }
	Write-Host 'OK: key login works. Next: .\setup.cmd check' -ForegroundColor Green
	exit 0
}

# --- every other step: upload the repo to the NAS and run setup.sh there --------------
& ssh -o BatchMode=yes -o ConnectTimeout=8 $Nas true
if ($LASTEXITCODE -ne 0) { Stop-Setup "can't log in to $Nas with your SSH key. Run first:  .\setup.cmd key" }

$tarPath = Join-Path ([IO.Path]::GetTempPath()) 'ex2-ultra-reborn.tar'
& tar -cf $tarPath -C $Repo setup.sh nas-system luci-app-nas luci-theme-nasos
if ($LASTEXITCODE -ne 0) { Stop-Setup 'could not pack the repo (tar).' }

# scp -O copies the file byte for byte (OpenWrt's dropbear provides the scp it needs)
& scp -q -O -o ConnectTimeout=8 $tarPath "${Nas}:/tmp/ex2rb.tar"
$rc = $LASTEXITCODE
if ($rc -ne 0) {
	# Windows 10's scp (OpenSSH 8.x) has no -O option; it already uses the classic protocol
	& scp -q -o ConnectTimeout=8 $tarPath "${Nas}:/tmp/ex2rb.tar"
	$rc = $LASTEXITCODE
}
Remove-Item $tarPath -ErrorAction SilentlyContinue
if ($rc -ne 0) { Stop-Setup "could not copy the files to the NAS (scp exit code $rc)." }

# -t gives setup.sh a terminal for its questions; files are removed from the NAS afterwards
& ssh -t -o ConnectTimeout=8 $Nas "rm -rf /tmp/ex2rb; mkdir -p /tmp/ex2rb && tar -xf /tmp/ex2rb.tar -C /tmp/ex2rb && rm -f /tmp/ex2rb.tar && NAS=local sh /tmp/ex2rb/setup.sh $Command; rc=`$?; rm -rf /tmp/ex2rb /tmp/ex2rb.tar; exit `$rc"
$rc = $LASTEXITCODE
if ($rc -ne 0) { exit $rc }

if ($Command -eq 'install') {
	$answer = Read-Host 'Reboot the NAS now? [y/N]'
	if ($answer -match '^[yY]') {
		& ssh -o ConnectTimeout=8 $Nas reboot
		Write-Host 'Rebooting. Wait about 2 minutes, then open the dashboard in your browser.'
	}
}
